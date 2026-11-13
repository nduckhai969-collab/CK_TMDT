#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ml/annotation_agreement.py

Đo lường độ nhất quán liên gán nhãn (Inter-Annotator Agreement - Cohen's Kappa) giữa Annotator A và Annotator B:
1. Độ nhất quán nhị phân (Aspect Presence: có/không khía cạnh).
2. Độ nhất quán cực tính (Sentiment Polarity: pos/neg/neu trên các ca cả hai cùng xác nhận có khía cạnh).
3. Độ nhất quán tổng thể 4 lớp (pos, neg, neu, none) kèm Raw Agreement (%).
4. Cảnh báo nếu có khía cạnh nào Kappa < 0.60.
5. Xuất danh sách bất đồng ra reports/annotation_disagreements.csv để chuẩn bị giải quyết (reconciliation).
"""

import os
import sys
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import csv
import argparse
import numpy as np
from sklearn.metrics import cohen_kappa_score, confusion_matrix

ASPECTS = ["quality", "price", "speed", "attitude", "warranty"]
VALID_LABELS = {"pos", "neg", "neu", "-"}

def normalize_label(val):
    if val is None:
        return "-"
    v = str(val).strip().lower()
    if v in ["pos", "positive", "+"]:
        return "pos"
    if v in ["neg", "negative", "-"] and v != "-":
        return "neg"
    if v in ["neu", "neutral", "0"]:
        return "neu"
    if v in ["-", "none", "", "null", "na"]:
        return "-"
    return v

def safe_cohen_kappa(y1, y2, labels=None):
    if len(y1) == 0 or len(y2) == 0:
        return float("nan")
    # Kiểm tra trường hợp tất cả nhãn giống hệt nhau
    if len(set(y1)) == 1 and set(y1) == set(y2):
        return 1.0
    try:
        score = cohen_kappa_score(y1, y2, labels=labels)
        if np.isnan(score):
            # Nếu thỏa thuận tuyệt đối mà marginals bằng nhau
            if y1 == y2:
                return 1.0
            return 0.0
        return float(score)
    except Exception:
        return float("nan")

def compute_agreement(file_a, file_b, disagreements_output=None):
    if not os.path.exists(file_a):
        print(f"[ERROR] Không tìm thấy file A: {file_a}")
        return False
    if not os.path.exists(file_b):
        print(f"[ERROR] Không tìm thấy file B: {file_b}")
        return False

    rows_a = {}
    with open(file_a, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            cid = (r.get("id") or "").strip()
            if cid and not cid.startswith("EXAMPLE_"):
                rows_a[cid] = r

    rows_b = {}
    with open(file_b, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            cid = (r.get("id") or "").strip()
            if cid and not cid.startswith("EXAMPLE_"):
                rows_b[cid] = r

    common_ids = sorted(list(set(rows_a.keys()) & set(rows_b.keys())))

    if not common_ids:
        print("[WARNING] Không tìm thấy câu đánh giá chung nào giữa file A và file B (hoặc chỉ có mẫu EXAMPLE_).")
        print("Vui lòng đảm bảo cả hai file đều chứa dữ liệu thật.")
        return False

    # Lọc bỏ các mẫu mà B chưa điền nhãn nào
    valid_common_ids = []
    for cid in common_ids:
        b_labels = [rows_b[cid].get(asp, "").strip() for asp in ASPECTS]
        if any(b_labels): # ít nhất 1 ô đã được điền
            valid_common_ids.append(cid)

    if not valid_common_ids:
        print("[WARNING] File B tồn tại nhưng chưa có câu nào được điền nhãn.")
        return False

    print(f"================================================================================")
    print(f"     BÁO CÁO ĐỘ NHẤT QUÁN LIÊN GÁN NHÃN (INTER-ANNOTATOR AGREEMENT)")
    print(f"================================================================================")
    print(f"Số mẫu kiểm định chéo giữa A và B: {len(valid_common_ids)} câu")
    print("-" * 80)

    disagreements = []

    # 1. Đo lường từng khía cạnh
    aspect_binary_kappas = {}
    aspect_sentiment_kappas = {}
    aspect_overall_kappas = {}
    aspect_raw_agreements = {}
    aspect_sentiment_samples = {}

    for asp in ASPECTS:
        labels_a_raw = [normalize_label(rows_a[cid].get(asp)) for cid in valid_common_ids]
        labels_b_raw = [normalize_label(rows_b[cid].get(asp)) for cid in valid_common_ids]

        # Kiểm tra bất đồng để ghi nhận
        for cid, la, lb in zip(valid_common_ids, labels_a_raw, labels_b_raw):
            if la != lb:
                disagreements.append({
                    "id": cid,
                    "aspect": asp,
                    "text": rows_a[cid].get("text", rows_b[cid].get("text", "")),
                    "label_A": la,
                    "label_B": lb,
                    "resolved_label": ""
                })

        # (i) Nhị phân: có khía cạnh (1) vs không có khía cạnh (0)
        bin_a = [1 if l in ["pos", "neg", "neu"] else 0 for l in labels_a_raw]
        bin_b = [1 if l in ["pos", "neg", "neu"] else 0 for l in labels_b_raw]
        k_bin = safe_cohen_kappa(bin_a, bin_b, labels=[0, 1])
        aspect_binary_kappas[asp] = k_bin

        # (ii) Cực tính: chỉ xét khi cả 2 cùng xác nhận có khía cạnh
        sent_pairs = [(la, lb) for la, lb in zip(labels_a_raw, labels_b_raw) if la in ["pos", "neg", "neu"] and lb in ["pos", "neg", "neu"]]
        aspect_sentiment_samples[asp] = len(sent_pairs)
        if len(sent_pairs) >= 2:
            s_a = [p[0] for p in sent_pairs]
            s_b = [p[1] for p in sent_pairs]
            k_sent = safe_cohen_kappa(s_a, s_b, labels=["pos", "neg", "neu"])
        else:
            k_sent = float("nan")
        aspect_sentiment_kappas[asp] = k_sent

        # (iii) Tổng thể 4 lớp: pos, neg, neu, -
        k_overall = safe_cohen_kappa(labels_a_raw, labels_b_raw, labels=["pos", "neg", "neu", "-"])
        aspect_overall_kappas[asp] = k_overall
        raw_match = sum(1 for la, lb in zip(labels_a_raw, labels_b_raw) if la == lb)
        aspect_raw_agreements[asp] = raw_match / len(valid_common_ids)

    # In bảng kết quả
    print(f"{'Khía cạnh':<12} | {'Nhị phân (A)':<14} | {'Cực tính (B)':<14} | {'n(B)':<5} | {'Tổng thể 4 lớp':<15} | {'Raw Agree':<10}")
    print("-" * 80)
    for asp in ASPECTS:
        kb_str = f"{aspect_binary_kappas[asp]:.4f}" if not np.isnan(aspect_binary_kappas[asp]) else "N/A"
        ks_str = f"{aspect_sentiment_kappas[asp]:.4f}" if not np.isnan(aspect_sentiment_kappas[asp]) else "N/A"
        ko_str = f"{aspect_overall_kappas[asp]:.4f}" if not np.isnan(aspect_overall_kappas[asp]) else "N/A"
        raw_str = f"{aspect_raw_agreements[asp]*100:.1f}%"
        print(f"{asp:<12} | {kb_str:<14} | {ks_str:<14} | {aspect_sentiment_samples[asp]:<5} | {ko_str:<15} | {raw_str:<10}")

    valid_kb = [v for v in aspect_binary_kappas.values() if not np.isnan(v)]
    valid_ks = [v for v in aspect_sentiment_kappas.values() if not np.isnan(v)]
    valid_ko = [v for v in aspect_overall_kappas.values() if not np.isnan(v)]
    mean_raw = np.mean(list(aspect_raw_agreements.values()))

    mean_kb_str = f"{np.mean(valid_kb):.4f}" if valid_kb else "N/A"
    mean_ks_str = f"{np.mean(valid_ks):.4f}" if valid_ks else "N/A"
    mean_ko_str = f"{np.mean(valid_ko):.4f}" if valid_ko else "N/A"

    print("-" * 80)
    print(f"{'TRUNG BÌNH':<12} | {mean_kb_str:<14} | {mean_ks_str:<14} | {'-':<5} | {mean_ko_str:<15} | {mean_raw*100:.1f}%")
    print("=" * 80)

    # Cảnh báo Kappa < 0.60
    low_kappas = []
    for asp in ASPECTS:
        if not np.isnan(aspect_overall_kappas[asp]) and aspect_overall_kappas[asp] < 0.60:
            low_kappas.append((asp, aspect_overall_kappas[asp]))

    if low_kappas:
        print("[CẢNH BÁO] Các khía cạnh có Cohen's Kappa tổng thể < 0.60 (mức đồng thuận yếu/vừa):")
        for asp, val in low_kappas:
            print(f"  - {asp}: Kappa = {val:.4f} < 0.60. Cần rà soát định nghĩa hoặc hướng dẫn thêm cho annotator.")
    else:
        print("[ĐẠT YÊU CẦU] Tất cả các khía cạnh đều có Cohen's Kappa >= 0.60 (độ đồng thuận tốt).")

    # Xuất danh sách bất đồng nếu có
    if disagreements_output:
        os.makedirs(os.path.dirname(os.path.abspath(disagreements_output)), exist_ok=True)
        with open(disagreements_output, "w", encoding="utf-8", newline="") as f:
            fieldnames = ["id", "aspect", "text", "label_A", "label_B", "resolved_label"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for d in disagreements:
                writer.writerow(d)
        print(f"\n[XUẤT BẤT ĐỒNG] Đã ghi nhận {len(disagreements)} điểm bất đồng vào: {disagreements_output}")
        print("  -> Vui lòng mở file trên, điền nhãn thống nhất (pos/neg/neu/-) vào cột 'resolved_label'.")

    return True

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Tính toán Cohen's Kappa giữa hai Annotator")
    parser.add_argument("--file-a", default="data/handwritten/annotator_A.csv", help="File CSV của Annotator A")
    parser.add_argument("--file-b", default="data/handwritten/annotator_B.csv", help="File CSV của Annotator B")
    parser.add_argument("--output-disagreements", default="reports/annotation_disagreements.csv", help="Đường dẫn lưu bảng bất đồng nhãn")

    args = parser.parse_args()
    compute_agreement(args.file_a, args.file_b, args.output_disagreements)
