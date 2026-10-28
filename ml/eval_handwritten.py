#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ml/eval_handwritten.py

Quy trình đánh giá ngoài phân phối (Out-of-Distribution Evaluation) trên tập review do NGƯỜI THẬT viết tay:
1. Đọc dữ liệu từ data/handwritten/annotator_A.csv và các nhãn đã thống nhất từ reports/annotation_disagreements.csv.
2. Bỏ qua các bất đồng chưa được giải quyết và cảnh báo.
3. Xuất tập dữ liệu chuẩn hóa ra data/export/handwritten_eval.json kèm chữ ký SHA256 chống sửa lén.
4. Tải mô hình Logistic Regression từ models/*.json (KHÔNG fit lại dữ liệu).
5. Đánh giá Tác vụ A (Aspect Detection) và Tác vụ B (Aspect Sentiment).
6. So sánh độ suy giảm hiệu năng so với tập Test chính thức ((F1_hw - F1_test) / F1_test).
7. In cảnh báo nếu số mẫu < 30 ("mẫu quá nhỏ, kết quả mang tính định hướng").
8. Xuất báo cáo markdown chi tiết ra reports/handwritten_eval.md.
"""

import os
import sys
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import csv
import json
import math
import re
import hashlib
import argparse
from datetime import datetime
from collections import Counter
import numpy as np
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score

from ml.preprocess import preprocess_text

ASPECTS = ["quality", "price", "speed", "attitude", "warranty"]
VALID_SENTIMENTS = {"pos", "neg", "neu"}

# Kết quả kiểm thử chính thức trên tập TEST (81 mẫu) làm mốc so sánh
TEST_BENCHMARKS = {
    "task_a": {
        "macro_f1": 0.7955,
        "micro_f1": 0.8000,
        "aspects": {
            "quality": {"precision": 0.7714, "recall": 0.8182, "f1": 0.7941},
            "price": {"precision": 0.9000, "recall": 0.9310, "f1": 0.9153},
            "speed": {"precision": 0.8667, "recall": 0.8125, "f1": 0.8387},
            "attitude": {"precision": 0.6970, "recall": 0.8846, "f1": 0.7797},
            "warranty": {"precision": 0.8182, "recall": 0.5625, "f1": 0.6429}
        }
    },
    "task_b": {
        "mean_accuracy": 0.7644,
        "mean_macro_f1": 0.6987,
        "aspects": {
            "quality": {"accuracy": 0.7576, "macro_f1": 0.7576, "support": 33},
            "price": {"accuracy": 0.8621, "macro_f1": 0.8687, "support": 29},
            "speed": {"accuracy": 0.8125, "macro_f1": 0.8125, "support": 16},
            "attitude": {"accuracy": 0.8846, "macro_f1": 0.8846, "support": 26},
            "warranty": {"accuracy": 0.5000, "macro_f1": 0.5000, "support": 16}
        }
    }
}

class FastLRInference:
    """Bộ suy luận Logistic Regression độc lập từ weights trong models/*.json (khớp 100% services/aspectInference.js)"""
    def __init__(self, det_model_path, sent_model_path):
        with open(det_model_path, "r", encoding="utf-8") as f:
            self.det_model = json.load(f)
        with open(sent_model_path, "r", encoding="utf-8") as f:
            self.sent_model = json.load(f)

        self.det_word_feats = self.det_model["word_features"]
        self.det_char_feats = self.det_model["char_features"]
        self.det_thresholds = self.det_model["thresholds"]
        self.det_weights = self.det_model["weights"]

        self.sent_word_feats = self.sent_model["word_features"]
        self.sent_char_feats = self.sent_model["char_features"]
        self.sent_weights = self.sent_model["weights"]

    @staticmethod
    def extract_word_ngrams(text):
        tokens = re.findall(r"[\w]+", text, flags=re.UNICODE)
        ngrams = list(tokens)
        n = len(tokens)
        for l in (2, 3):
            for i in range(n - l + 1):
                ngrams.append(" ".join(tokens[i:i+l]))
        return ngrams

    @staticmethod
    def extract_char_wb_ngrams(text):
        words = text.strip().split()
        ngrams = []
        for raw_w in words:
            if not raw_w:
                continue
            w_chars = list(" " + raw_w + " ")
            w_len = len(w_chars)
            for n in (2, 3, 4, 5):
                for i in range(w_len - n + 1):
                    ngrams.append("".join(w_chars[i:i+n]))
        return ngrams

    @staticmethod
    def vectorize_sparse(ngrams, vocab, idf_array):
        counts = Counter()
        for ng in ngrams:
            idx = vocab.get(ng)
            if idx is not None:
                counts[idx] += 1
        if not counts:
            return {}
        sum_sq = 0.0
        raw = {}
        for idx, count in counts.items():
            val = (1.0 + math.log(count)) * idf_array[idx]
            raw[idx] = val
            sum_sq += val * val
        norm = math.sqrt(sum_sq)
        if norm == 0.0:
            return {}
        return {idx: val / norm for idx, val in raw.items()}

    @staticmethod
    def dot_product(sparse_vec, dense_coef):
        return sum(val * dense_coef[idx] for idx, val in sparse_vec.items())

    def predict_aspects(self, text):
        clean = preprocess_text(text)
        w_ngrams = self.extract_word_ngrams(clean)
        c_ngrams = self.extract_char_wb_ngrams(clean)

        w_sparse = self.vectorize_sparse(w_ngrams, self.det_word_feats["vocab"], self.det_word_feats["idf"])
        c_sparse = self.vectorize_sparse(c_ngrams, self.det_char_feats["vocab"], self.det_char_feats["idf"])

        preds = {}
        probs = {}
        for asp in ASPECTS:
            w_asp = self.det_weights[asp]
            dot = w_asp["intercept"] + self.dot_product(w_sparse, w_asp["word_coef"]) + self.dot_product(c_sparse, w_asp["char_coef"])
            prob = 1.0 / (1.0 + math.exp(-dot))
            probs[asp] = prob
            preds[asp] = 1 if prob >= self.det_thresholds[asp] else 0
        return preds, probs

    def predict_sentiment(self, text, asp):
        clean = preprocess_text(text)
        w_ngrams = self.extract_word_ngrams(clean)
        c_ngrams = self.extract_char_wb_ngrams(clean)

        w_sparse = self.vectorize_sparse(w_ngrams, self.sent_word_feats["vocab"], self.sent_word_feats["idf"])
        c_sparse = self.vectorize_sparse(c_ngrams, self.sent_char_feats["vocab"], self.sent_char_feats["idf"])

        w_asp = self.sent_weights[asp]
        classes = w_asp["classes"]

        logits = []
        for cls in classes:
            cw = w_asp["class_weights"][cls]
            dot = cw["intercept"] + self.dot_product(w_sparse, cw["word_coef"]) + self.dot_product(c_sparse, cw["char_coef"])
            logits.append(dot)

        max_logit = max(logits)
        exps = [math.exp(l - max_logit) for l in logits]
        sum_e = sum(exps)
        probs = {cls: e / sum_e for cls, e in zip(classes, exps)}
        pred_cls = max(probs, key=probs.get)
        return pred_cls, probs


def load_and_resolve_data(annotator_a_path, disagreements_path):
    if not os.path.exists(annotator_a_path):
        print(f"[ERROR] Không tìm thấy file annotator_A: {annotator_a_path}")
        return []

    # 1. Đọc danh sách bất đồng đã giải quyết
    resolved_disagreements = {}
    unresolved_disagreements = set()
    if os.path.exists(disagreements_path):
        with open(disagreements_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cid = (row.get("id") or "").strip()
                asp = (row.get("aspect") or "").strip()
                res = (row.get("resolved_label") or "").strip().lower()
                if not cid or not asp:
                    continue
                if res in ["pos", "neg", "neu", "-"]:
                    resolved_disagreements[(cid, asp)] = res
                else:
                    unresolved_disagreements.add((cid, asp))

    # 2. Đọc Annotator A
    with open(annotator_a_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    samples = []
    skipped_unresolved = 0
    for r in raw_rows:
        cid = (r.get("id") or "").strip()
        if not cid or cid.startswith("EXAMPLE_"):
            continue

        text = (r.get("text") or "").strip()
        writer = (r.get("writer") or "unknown").strip()

        # Kiểm tra xem có bất đồng nào chưa được giải quyết ở câu này không
        has_unresolved = False
        for asp in ASPECTS:
            if (cid, asp) in unresolved_disagreements:
                print(f"[CẢNH BÁO] Bỏ qua câu ID='{cid}' do bất đồng khía cạnh '{asp}' chưa có resolved_label!")
                has_unresolved = True
                break
        if has_unresolved:
            skipped_unresolved += 1
            continue

        aspect_dict = {}
        for asp in ASPECTS:
            if (cid, asp) in resolved_disagreements:
                aspect_dict[asp] = resolved_disagreements[(cid, asp)]
            else:
                raw_val = (r.get(asp) or "-").strip().lower()
                if raw_val in ["pos", "neg", "neu"]:
                    aspect_dict[asp] = raw_val
                else:
                    aspect_dict[asp] = "-"

        samples.append({
            "id": cid,
            "writer": writer,
            "text": text,
            "aspects": aspect_dict
        })

    if skipped_unresolved > 0:
        print(f"[THÔNG BÁO] Đã bỏ qua {skipped_unresolved} câu vì có bất đồng chưa giải quyết.")
    return samples


def evaluate_handwritten(samples, det_model_path, sent_model_path):
    infer = FastLRInference(det_model_path, sent_model_path)

    # 1. Tác vụ A: Nhận diện khía cạnh
    task_a_y_true = {asp: [] for asp in ASPECTS}
    task_a_y_pred = {asp: [] for asp in ASPECTS}
    task_a_probs = {asp: [] for asp in ASPECTS}

    # 2. Tác vụ B: Phân loại cực tính (chỉ tính trên mẫu có khía cạnh trong ground truth)
    task_b_y_true = {asp: [] for asp in ASPECTS}
    task_b_y_pred = {asp: [] for asp in ASPECTS}
    task_b_sample_indices = {asp: [] for asp in ASPECTS}

    detailed_predictions = []

    for idx, s in enumerate(samples):
        text = s["text"]
        gt_aspects = s["aspects"]

        pred_asp, prob_asp = infer.predict_aspects(text)

        pred_sent_dict = {}
        for asp in ASPECTS:
            # Gán nhãn cho tác vụ A
            is_present_gt = 1 if gt_aspects[asp] in VALID_SENTIMENTS else 0
            task_a_y_true[asp].append(is_present_gt)
            task_a_y_pred[asp].append(pred_asp[asp])
            task_a_probs[asp].append(prob_asp[asp])

            # Nếu mẫu có khía cạnh trong ground truth, đánh giá tác vụ B
            if is_present_gt == 1:
                pred_s, _ = infer.predict_sentiment(text, asp)
                task_b_y_true[asp].append(gt_aspects[asp])
                task_b_y_pred[asp].append(pred_s)
                task_b_sample_indices[asp].append(idx)
                pred_sent_dict[asp] = pred_s

        detailed_predictions.append({
            "id": s["id"],
            "writer": s["writer"],
            "text": text,
            "ground_truth": gt_aspects,
            "pred_aspects": pred_asp,
            "pred_sentiments": pred_sent_dict,
            "probs": prob_asp
        })

    # Tính toán chỉ số Tác vụ A
    task_a_metrics = {}
    all_y_true = []
    all_y_pred = []
    f1_list = []

    for asp in ASPECTS:
        yt = task_a_y_true[asp]
        yp = task_a_y_pred[asp]
        prec = precision_score(yt, yp, zero_division=0)
        rec = recall_score(yt, yp, zero_division=0)
        f1 = f1_score(yt, yp, zero_division=0)
        task_a_metrics[asp] = {
            "precision": float(prec),
            "recall": float(rec),
            "f1": float(f1),
            "support": int(sum(yt))
        }
        f1_list.append(f1)
        all_y_true.extend(yt)
        all_y_pred.extend(yp)

    task_a_macro_f1 = float(np.mean(f1_list))
    task_a_micro_f1 = float(f1_score(all_y_true, all_y_pred, zero_division=0))

    # Tính toán chỉ số Tác vụ B
    task_b_metrics = {}
    b_acc_list = []
    b_f1_list = []

    for asp in ASPECTS:
        yt = task_b_y_true[asp]
        yp = task_b_y_pred[asp]
        n_samples = len(yt)
        if n_samples > 0:
            acc = accuracy_score(yt, yp)
            # Chỉ tính trên các lớp có support > 0
            classes_present = sorted(list(set(yt)))
            f1_m = f1_score(yt, yp, labels=classes_present, average="macro", zero_division=0)
            task_b_metrics[asp] = {
                "accuracy": float(acc),
                "macro_f1": float(f1_m),
                "support": n_samples,
                "classes": classes_present
            }
            b_acc_list.append(acc)
            b_f1_list.append(f1_m)
        else:
            task_b_metrics[asp] = {
                "accuracy": float("nan"),
                "macro_f1": float("nan"),
                "support": 0,
                "classes": []
            }

    task_b_mean_acc = float(np.mean(b_acc_list)) if b_acc_list else float("nan")
    task_b_mean_macro_f1 = float(np.mean(b_f1_list)) if b_f1_list else float("nan")

    return {
        "task_a": {
            "macro_f1": task_a_macro_f1,
            "micro_f1": task_a_micro_f1,
            "aspects": task_a_metrics
        },
        "task_b": {
            "mean_accuracy": task_b_mean_acc,
            "mean_macro_f1": task_b_mean_macro_f1,
            "aspects": task_b_metrics
        },
        "detailed_predictions": detailed_predictions
    }


def generate_markdown_report(samples, results, output_report_path, sha256_hash):
    os.makedirs(os.path.dirname(os.path.abspath(output_report_path)), exist_ok=True)
    n_samples = len(samples)
    writers = sorted(list(set(s["writer"] for s in samples)))

    a_res = results["task_a"]
    b_res = results["task_b"]

    # Độ suy giảm hiệu năng so với test chính thức
    test_a_macro = TEST_BENCHMARKS["task_a"]["macro_f1"]
    test_b_acc = TEST_BENCHMARKS["task_b"]["mean_accuracy"]

    deg_a_macro = ((a_res["macro_f1"] - test_a_macro) / test_a_macro) * 100.0
    deg_b_acc = ((b_res["mean_accuracy"] - test_b_acc) / test_b_acc) * 100.0

    lines = []
    lines.append("# Báo Cáo Đánh Giá Ngoài Phân Phối (Out-of-Distribution Evaluation)")
    lines.append(f"**Tập dữ liệu**: Review do người thật viết tay và gán nhãn độc lập (`data/handwritten/annotator_A.csv`)  ")
    lines.append(f"**Ngày thực hiện**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  ")
    lines.append(f"**Chữ ký số SHA256 chống sửa đổi**: `{sha256_hash}`  \n")

    lines.append("## 1. Tóm Tắt Tập Dữ Liệu Kiểm Thử")
    lines.append(f"- **Tổng số câu đánh giá hợp lệ**: **{n_samples} câu**")
    lines.append(f"- **Số lượng người viết (Writers)**: {len(writers)} người ({', '.join(writers)})")
    
    if n_samples < 30:
        lines.append("\n> [!WARNING] Cảnh báo kích thước mẫu nhỏ")
        lines.append(f"> Số lượng mẫu hiện tại ($n = {n_samples}$) nhỏ hơn 30. Kết quả đánh giá mang tính định hướng ban đầu (pilot evaluation), sai số thống kê còn lớn. Cần bổ sung thêm người viết để đạt mức tối thiểu 30–50 mẫu nhằm khẳng định chắc chắn.\n")

    lines.append("### Phân bố khía cạnh trong tập viết tay:")
    lines.append("| Khía Cạnh | Số Câu Xuất Hiện (Support) | Tỷ Lệ Xuất Hiện (%) |")
    lines.append("| :--- | :---: | :---: |")
    for asp in ASPECTS:
        sup = a_res["aspects"][asp]["support"]
        lines.append(f"| `{asp}` | {sup} | {sup / max(1, n_samples) * 100:.1f}% |")

    lines.append("\n---\n")
    lines.append("## 2. Kết Quả Tác Vụ A: Nhận Diện Khía Cạnh (Aspect Detection)")
    lines.append(f"**Macro-F1**: **{a_res['macro_f1']:.4f}** (So với TEST chính thức: {test_a_macro:.4f} $\\rightarrow$ **Độ suy giảm: {deg_a_macro:+.2f}%**)  ")
    lines.append(f"**Micro-F1**: **{a_res['micro_f1']:.4f}** (So với TEST chính thức: {TEST_BENCHMARKS['task_a']['micro_f1']:.4f})  \n")

    lines.append("| Khía Cạnh | Precision (HW) | Recall (HW) | F1-Score (HW) | F1-Score (TEST) | Độ Thay Đổi (%) |")
    lines.append("| :--- | :---: | :---: | :---: | :---: | :---: |")
    for asp in ASPECTS:
        hw_m = a_res["aspects"][asp]
        test_m = TEST_BENCHMARKS["task_a"]["aspects"][asp]
        chg = ((hw_m["f1"] - test_m["f1"]) / test_m["f1"]) * 100.0 if test_m["f1"] > 0 else 0.0
        lines.append(f"| `{asp}` | {hw_m['precision']:.4f} | {hw_m['recall']:.4f} | **{hw_m['f1']:.4f}** | {test_m['f1']:.4f} | {chg:+.2f}% |")

    lines.append("\n---\n")
    lines.append("## 3. Kết Quả Tác Vụ B: Phân Loại Cực Tính (Aspect Sentiment)")
    lines.append(f"**Mean Accuracy**: **{b_res['mean_accuracy']:.4f}** (So với TEST chính thức: {test_b_acc:.4f} $\\rightarrow$ **Độ suy giảm: {deg_b_acc:+.2f}%**)  ")
    lines.append(f"**Mean Macro-F1**: **{b_res['mean_macro_f1']:.4f}** (So với TEST chính thức: {TEST_BENCHMARKS['task_b']['mean_macro_f1']:.4f})  \n")

    lines.append("| Khía Cạnh | Số Mẫu (n) | Accuracy (HW) | Acc (TEST) | Macro-F1 (HW) | Macro-F1 (TEST) |")
    lines.append("| :--- | :---: | :---: | :---: | :---: | :---: |")
    for asp in ASPECTS:
        hw_b = b_res["aspects"][asp]
        test_b = TEST_BENCHMARKS["task_b"]["aspects"][asp]
        acc_str = f"**{hw_b['accuracy']:.4f}**" if not np.isnan(hw_b["accuracy"]) else "N/A"
        f1_str = f"**{hw_b['macro_f1']:.4f}**" if not np.isnan(hw_b["macro_f1"]) else "N/A"
        lines.append(f"| `{asp}` | {hw_b['support']} | {acc_str} | {test_b['accuracy']:.4f} | {f1_str} | {test_b['macro_f1']:.4f} |")

    lines.append("\n---\n")
    lines.append("## 4. Phân Tích Độ Suy Giảm Hiệu Năng & Hiện Tượng Dịch Chuyển Phân Bố (Domain Shift)")
    lines.append("Khi đánh giá trên review người thật viết tay không theo khuôn mẫu tổng hợp:")
    lines.append("1. **Văn phong tự nhiên & Từ lóng mới**: Người thật sử dụng nhiều từ ngữ địa phương, tiếng lóng mạng xã hội và cách gõ tắt đa dạng ngoài tập từ vựng đào tạo (OOV words).")
    lines.append("2. **Cấu trúc câu ghép phức tạp**: Các câu khen chê tương phản (*'vẽ logo rất đẹp nhưng thái độ nhắn tin cọc cằn'*) đòi hỏi mô hình phân bổ chính xác cảm xúc về đúng khía cạnh mà không bị hiện tượng tràn cảm xúc chéo (sentiment bleeding).")
    lines.append("3. **Khía cạnh Bảo hành (Warranty)**: Trong thực tế, khách hàng ít khi nhắc tới bảo hành trừ khi gặp sự cố, do đó số lượng mẫu khía cạnh này thường có support thấp và phân bố cực tính lệch.")

    # Tìm một số lỗi điển hình nếu có
    lines.append("\n---\n")
    lines.append("## 5. Các Mẫu Dự Đoán Cần Rà Soát (Lỗi Điển Hình)")
    errors_found = 0
    for pred in results["detailed_predictions"]:
        cid = pred["id"]
        text = pred["text"]
        gt = pred["ground_truth"]
        pa = pred["pred_aspects"]
        ps = pred["pred_sentiments"]

        # Kiểm tra bất đồng
        mismatch_aspects = []
        for asp in ASPECTS:
            gt_has = 1 if gt[asp] in VALID_SENTIMENTS else 0
            if gt_has != pa[asp]:
                mismatch_aspects.append(f"A({asp}: GT={gt_has} vs Pred={pa[asp]})")
            elif gt_has == 1 and asp in ps and gt[asp] != ps[asp]:
                mismatch_aspects.append(f"B({asp}: GT={gt[asp]} vs Pred={ps[asp]})")

        if mismatch_aspects:
            errors_found += 1
            if errors_found <= 10:
                lines.append(f"- **[{cid}]** *\"{text}\"*")
                lines.append(f"  - Sai lệch: {', '.join(mismatch_aspects)}")

    if errors_found == 0:
        lines.append("*Tất cả các dự đoán đều trùng khớp hoàn hảo với ground truth.*")
    elif errors_found > 10:
        lines.append(f"\n*(Còn {errors_found - 10} trường hợp sai lệch khác...)*")

    content = "\n".join(lines) + "\n"
    with open(output_report_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[XUẤT BÁO CÁO] Đã xuất báo cáo chi tiết ra: {output_report_path}")


def run_pipeline(annotator_a_path, disagreements_path, export_json_path, report_path, det_model_path, sent_model_path):
    print("=" * 80)
    print("     QUY TRÌNH ĐÁNH GIÁ NGOÀI PHÂN PHỐI (OUT-OF-DISTRIBUTION EVALUATION)")
    print("=" * 80)

    # 1. Đọc và giải quyết nhãn
    samples = load_and_resolve_data(annotator_a_path, disagreements_path)

    if not samples:
        print("[INFO] Chưa có dữ liệu review người thật hợp lệ trong annotator_A.csv.")
        print("Tất cả các dòng hiện tại là mẫu ví dụ (EXAMPLE_) hoặc file chưa có nội dung.")
        print("-> Hạ tầng đánh giá đã sẵn sàng và đang chờ dữ liệu người thật được thu thập.")
        return False

    n_samples = len(samples)
    print(f"[NẠP DỮ LIỆU] Tìm thấy {n_samples} câu đánh giá người thật hợp lệ.")

    # 2. Tạo chữ ký SHA256 chống sửa lén
    canonical_str = json.dumps(samples, sort_keys=True, ensure_ascii=False)
    sha256_hash = hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    # 3. Xuất ra file JSON chuẩn hóa
    export_payload = {
        "metadata": {
            "source": "handwritten_human_reviews",
            "annotator_file": os.path.basename(annotator_a_path),
            "created_at": datetime.now().isoformat(),
            "total_samples": n_samples,
            "sha256": sha256_hash
        },
        "samples": samples
    }
    os.makedirs(os.path.dirname(os.path.abspath(export_json_path)), exist_ok=True)
    with open(export_json_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, ensure_ascii=False, indent=2)
    print(f"[XUẤT DỮ LIỆU] Đã lưu {n_samples} mẫu vào {export_json_path} (SHA256: {sha256_hash[:16]}...)")

    # 4. Chạy đánh giá mô hình
    if n_samples < 30:
        print("\n" + "!" * 80)
        print(f"[CẢNH BÁO KÍCH THƯỚC MẪU] Số mẫu hiện tại n = {n_samples} < 30.")
        print("Mẫu quá nhỏ, kết quả mang tính định hướng ban đầu!")
        print("!" * 80 + "\n")

    results = evaluate_handwritten(samples, det_model_path, sent_model_path)

    # In tóm tắt kết quả
    a_macro = results["task_a"]["macro_f1"]
    b_acc = results["task_b"]["mean_accuracy"]
    test_a_macro = TEST_BENCHMARKS["task_a"]["macro_f1"]
    test_b_acc = TEST_BENCHMARKS["task_b"]["mean_accuracy"]

    print("-" * 80)
    print(f"KẾT QUẢ ĐÁNH GIÁ TRÊN REVIEW NGƯỜI THẬT:")
    print(f"  - Tác vụ A (Aspect Detection): Macro-F1 = {a_macro:.4f} (TEST: {test_a_macro:.4f}, Thay đổi: {((a_macro-test_a_macro)/test_a_macro)*100:+.2f}%)")
    print(f"  - Tác vụ B (Aspect Sentiment): Mean Accuracy = {b_acc:.4f} (TEST: {test_b_acc:.4f}, Thay đổi: {((b_acc-test_b_acc)/test_b_acc)*100:+.2f}%)")
    print("-" * 80)

    # 5. Xuất báo cáo Markdown
    generate_markdown_report(samples, results, report_path, sha256_hash)
    return True


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Đánh giá mô hình trên review người thật viết tay")
    parser.add_argument("--annotator-a", default="data/handwritten/annotator_A.csv", help="Đường dẫn file annotator_A.csv")
    parser.add_argument("--disagreements", default="reports/annotation_disagreements.csv", help="Đường dẫn file annotation_disagreements.csv")
    parser.add_argument("--export-json", default="data/export/handwritten_eval.json", help="Đường dẫn xuất file JSON")
    parser.add_argument("--report", default="reports/handwritten_eval.md", help="Đường dẫn xuất file báo cáo markdown")
    parser.add_argument("--det-model", default="models/aspect_detection.json", help="Đường dẫn file mô hình Aspect Detection")
    parser.add_argument("--sent-model", default="models/aspect_sentiment.json", help="Đường dẫn file mô hình Aspect Sentiment")

    args = parser.parse_args()
    run_pipeline(args.annotator_a, args.disagreements, args.export_json, args.report, args.det_model, args.sent_model)
