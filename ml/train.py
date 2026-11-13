"""
ml/train.py
Huấn luyện, đánh giá, kiểm thử mô hình Aspect-based Sentiment Analysis.
Tác vụ A: Aspect Detection (5 khía cạnh: quality, price, speed, attitude, warranty)
Tác vụ B: Aspect Sentiment (3 cực tính: pos, neg, neu cho từng khía cạnh)

Mô hình chính: Logistic Regression (TF-IDF word 1-3 + char_wb 2-5, sublinear_tf=True)
Mô hình so sánh: Majority, Rule-based từ khóa, MultinomialNB, LinearSVC
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
import csv
import re
import math
import unicodedata
import warnings
warnings.filterwarnings('ignore')
from collections import Counter, defaultdict
import numpy as np

# Set random seed
RANDOM_STATE = 42
np.random.seed(RANDOM_STATE)

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.naive_bayes import MultinomialNB
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import (
    f1_score, precision_score, recall_score,
    accuracy_score, confusion_matrix, classification_report
)

from ml.preprocess import preprocess_text, normalize_text_base, remove_accents

ASPECTS = ['quality', 'price', 'speed', 'attitude', 'warranty']
SENTIMENTS = ['pos', 'neg', 'neu']

DATA_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'export', 'reviews_labeled.json')
MANUAL_DATA_FILES = [
    os.path.join(os.path.dirname(__file__), '..', 'data', 'handwritten', 'annotator_A.csv'),
    os.path.join(os.path.dirname(__file__), '..', 'data', 'handwritten', 'review_seed.csv')
]
LEXICON_FILE = os.path.join(os.path.dirname(__file__), 'aspect_lexicon.json')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
REPORTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'reports')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


def load_dataset():
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Bỏ các ví dụ/demo trong template. Bản ghi bổ sung chỉ được đưa vào train;
    # validation/test cố định để có thể so sánh model giữa các lần huấn luyện.
    for manual_file in MANUAL_DATA_FILES:
        if not os.path.exists(manual_file):
            continue
        with open(manual_file, 'r', encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                sample_id = (row.get('id') or '').strip()
                text = (row.get('text') or '').strip()
                if not sample_id or sample_id.upper().startswith(('DEMO_', 'EXAMPLE_')) or not text:
                    continue
                aspect_map = {}
                for aspect in ASPECTS:
                    label = (row.get(aspect) or '-').strip().lower()
                    if label in ('pos', 'neg', 'neu'):
                        aspect_map[aspect] = label
                    elif label not in ('', '-'):
                        raise ValueError(f"Nhãn không hợp lệ trong {manual_file}: {sample_id}/{aspect}={label}")
                data.append({
                    'id': f'MANUAL_{os.path.basename(manual_file)}_{sample_id}', 'content': text,
                    'providerId': f'MANUAL_{os.path.basename(manual_file)}_{(row.get("writer") or sample_id).strip()}',
                    'style': 'handwritten', 'split': 'train',
                    'groundTruth': {'aspects': [{'aspect': a, 'sentiment': s} for a, s in aspect_map.items()]}
                })
    return data


def extract_targets(samples):
    """
    Trích xuất ma trận nhãn Tác vụ A (multi-label binary) và danh mục nhãn Tác vụ B (pos/neg/neu).
    """
    N = len(samples)
    y_aspects = np.zeros((N, len(ASPECTS)), dtype=int)
    # y_sentiments[aspect] = list of sentiments ('pos'/'neg'/'neu' or None if aspect absent)
    y_sentiments = {a: [None] * N for a in ASPECTS}

    for i, r in enumerate(samples):
        aspect_map = {item['aspect']: item['sentiment'] for item in r['groundTruth']['aspects']}
        for j, a in enumerate(ASPECTS):
            if a in aspect_map:
                y_aspects[i, j] = 1
                y_sentiments[a][i] = aspect_map[a]

    return y_aspects, y_sentiments


def analyze_dataset_distribution(data):
    """
    Thống kê số mẫu Khía cạnh x Cực tính theo train / val / test.
    Cảnh báo các ô có dưới 10 mẫu.
    """
    splits = ['train', 'val', 'test']
    stats = {}
    for s in splits:
        subset = [r for r in data if r['split'] == s]
        counts = {a: Counter() for a in ASPECTS}
        for r in subset:
            aspect_map = {item['aspect']: item['sentiment'] for item in r['groundTruth']['aspects']}
            for a in ASPECTS:
                if a in aspect_map:
                    counts[a][aspect_map[a]] += 1
                else:
                    counts[a]['absent'] += 1
        stats[s] = {'total': len(subset), 'counts': counts}
    return stats


class RuleBasedAspectModel:
    """
    Baseline 2: Mô hình dựa trên luật từ khóa (Lexicon matching).
    """
    def __init__(self, lexicon_path):
        with open(lexicon_path, 'r', encoding='utf-8') as f:
            self.lexicon = json.load(f)
        # Tiền xử lý từ điển
        self.processed_lexicon = {}
        for a in ASPECTS:
            self.processed_lexicon[a] = {}
            for s in ['pos', 'neg', 'neu']:
                phrases = [normalize_text_base(p) for p in self.lexicon[a].get(s, [])]
                self.processed_lexicon[a][s] = phrases

    def predict_aspects(self, texts):
        N = len(texts)
        preds = np.zeros((N, len(ASPECTS)), dtype=int)
        for i, text in enumerate(texts):
            clean = normalize_text_base(text)
            unacc = remove_accents(clean)
            for j, a in enumerate(ASPECTS):
                found = False
                for s in ['pos', 'neg', 'neu']:
                    for phrase in self.processed_lexicon[a][s]:
                        p_unacc = remove_accents(phrase)
                        if phrase in clean or p_unacc in unacc:
                            found = True
                            break
                    if found:
                        break
                if found:
                    preds[i, j] = 1
        return preds

    def predict_sentiment_for_aspect(self, texts, aspect):
        results = []
        for text in texts:
            clean = normalize_text_base(text)
            unacc = remove_accents(clean)
            pos_matches = sum(1 for p in self.processed_lexicon[aspect]['pos'] if p in clean or remove_accents(p) in unacc)
            neg_matches = sum(1 for p in self.processed_lexicon[aspect]['neg'] if p in clean or remove_accents(p) in unacc)
            neu_matches = sum(1 for p in self.processed_lexicon[aspect]['neu'] if p in clean or remove_accents(p) in unacc)

            if pos_matches > neg_matches and pos_matches >= neu_matches:
                results.append('pos')
            elif neg_matches > pos_matches and neg_matches >= neu_matches:
                results.append('neg')
            else:
                results.append('neu')
        return np.array(results)


def tune_logistic_regression(X_train, y_aspects_train, y_sentiments_train, train_providers):
    """
    Tìm C tối ưu trong {0.1, 0.3, 1, 3, 10} bằng GroupKFold(providerId) trên train.
    """
    # Smaller regularization search space discourages memorizing synthetic phrase patterns.
    C_values = [0.01, 0.03, 0.1, 0.3, 1.0]
    gkf = GroupKFold(n_splits=5)

    print("\n--- [GridSearch + GroupKFold] Tác vụ A: Aspect Detection ---")
    best_C_A = {}
    for j, a in enumerate(ASPECTS):
        y_col = y_aspects_train[:, j]
        best_score = -1.0
        best_c = 1.0
        for C in C_values:
            cv_f1s = []
            for trn_idx, val_idx in gkf.split(X_train, y_col, groups=train_providers):
                clf = LogisticRegression(
                    C=C, penalty='l2', class_weight='balanced',
                    solver='liblinear', random_state=RANDOM_STATE
                )
                clf.fit(X_train[trn_idx], y_col[trn_idx])
                preds = clf.predict(X_train[val_idx])
                score = f1_score(y_col[val_idx], preds, zero_division=0)
                cv_f1s.append(score)
            mean_f1 = np.mean(cv_f1s)
            print(f"  Aspect: {a:10s} | C: {C:4.1f} | Mean CV F1: {mean_f1:.4f}")
            if mean_f1 > best_score:
                best_score = mean_f1
                best_c = C
        best_C_A[a] = best_c
        print(f"  => Best C for {a}: {best_c} (CV F1 = {best_score:.4f})")

    print("\n--- [GridSearch + GroupKFold] Tác vụ B: Aspect Sentiment ---")
    best_C_B = {}
    for a in ASPECTS:
        labels = y_sentiments_train[a]
        present_indices = [i for i, val in enumerate(labels) if val is not None]
        if len(present_indices) < 10:
            best_C_B[a] = 1.0
            continue

        X_sub = X_train[present_indices]
        y_sub = np.array([labels[i] for i in present_indices])
        groups_sub = [train_providers[i] for i in present_indices]

        # Kiểm tra số nhóm duy nhất
        n_groups = len(set(groups_sub))
        n_splits = min(3, n_groups)
        sub_gkf = GroupKFold(n_splits=n_splits)

        best_score = -1.0
        best_c = 1.0
        for C in C_values:
            cv_f1s = []
            for trn_idx, val_idx in sub_gkf.split(X_sub, y_sub, groups=groups_sub):
                # Kiểm tra lớp huấn luyện có đủ không
                if len(set(y_sub[trn_idx])) < 2:
                    continue
                clf = LogisticRegression(
                    C=C, penalty='l2', class_weight='balanced',
                    solver='lbfgs', random_state=RANDOM_STATE, max_iter=500
                )
                clf.fit(X_sub[trn_idx], y_sub[trn_idx])
                preds = clf.predict(X_sub[val_idx])
                score = f1_score(y_sub[val_idx], preds, average='macro', zero_division=0)
                cv_f1s.append(score)
            mean_f1 = np.mean(cv_f1s) if cv_f1s else 0.0
            print(f"  Sentiment {a:10s} | C: {C:4.1f} | Mean CV Macro-F1: {mean_f1:.4f}")
            if mean_f1 > best_score:
                best_score = mean_f1
                best_c = C
        best_C_B[a] = best_c
        print(f"  => Best C for sentiment {a}: {best_c} (CV Macro-F1 = {best_score:.4f})")

    return best_C_A, best_C_B


def tune_thresholds_on_val(models_A, X_val, y_aspects_val):
    """
    Quét ngưỡng từ 0.10 đến 0.90 trên tập VAL để tìm ngưỡng F1 cao nhất cho từng khía cạnh.
    """
    thresholds = {}
    print("\n--- Chốt ngưỡng quyết định riêng từng khía cạnh trên VAL ---")
    threshold_range = np.arange(0.10, 0.91, 0.05)
    for j, a in enumerate(ASPECTS):
        clf = models_A[a]
        probs = clf.predict_proba(X_val)[:, 1]
        y_true = y_aspects_val[:, j]

        best_thresh = 0.5
        best_f1 = -1.0
        for th in threshold_range:
            preds = (probs >= th).astype(int)
            score = f1_score(y_true, preds, zero_division=0)
            if score > best_f1:
                best_f1 = score
                best_thresh = float(round(th, 2))
        thresholds[a] = best_thresh
        print(f"  Aspect: {a:10s} | Best Threshold: {best_thresh:.2f} | Val F1: {best_f1:.4f}")
    return thresholds


def evaluate_baselines_on_val(X_train, y_aspects_train, y_sentiments_train,
                             X_val, y_aspects_val, y_sentiments_val,
                             raw_val_texts, rule_model, lr_models_A, lr_thresholds_A, lr_models_B):
    """
    So sánh 5 mô hình trên tập VAL:
    (1) Majority-class
    (2) Rule-based
    (3) Multinomial Naive Bayes
    (4) Linear SVM
    (5) Logistic Regression (chính)
    """
    results = {}

    # ---------------- 1. Majority Class ----------------
    maj_preds_A = np.zeros_like(y_aspects_val)
    maj_preds_B = {}
    for a in ASPECTS:
        train_labels = [l for l in y_sentiments_train[a] if l is not None]
        maj_sent = Counter(train_labels).most_common(1)[0][0]
        val_count = sum(1 for l in y_sentiments_val[a] if l is not None)
        maj_preds_B[a] = [maj_sent] * val_count

    # ---------------- 2. Rule-based ----------------
    rule_preds_A = rule_model.predict_aspects(raw_val_texts)
    rule_preds_B = {}
    for a in ASPECTS:
        val_indices = [i for i, l in enumerate(y_sentiments_val[a]) if l is not None]
        sub_texts = [raw_val_texts[i] for i in val_indices]
        rule_preds_B[a] = rule_model.predict_sentiment_for_aspect(sub_texts, a)

    # ---------------- 3. Multinomial Naive Bayes ----------------
    nb_models_A = {}
    nb_preds_A = np.zeros_like(y_aspects_val)
    for j, a in enumerate(ASPECTS):
        nb = MultinomialNB()
        nb.fit(X_train, y_aspects_train[:, j])
        nb_models_A[a] = nb
        nb_preds_A[:, j] = nb.predict(X_val)

    nb_models_B = {}
    nb_preds_B = {}
    for a in ASPECTS:
        train_indices = [i for i, l in enumerate(y_sentiments_train[a]) if l is not None]
        val_indices = [i for i, l in enumerate(y_sentiments_val[a]) if l is not None]
        if train_indices and val_indices:
            nb = MultinomialNB()
            nb.fit(X_train[train_indices], [y_sentiments_train[a][i] for i in train_indices])
            nb_models_B[a] = nb
            nb_preds_B[a] = nb.predict(X_val[val_indices])
        else:
            nb_preds_B[a] = []

    # ---------------- 4. Linear SVM ----------------
    svm_models_A = {}
    svm_preds_A = np.zeros_like(y_aspects_val)
    for j, a in enumerate(ASPECTS):
        svm = LinearSVC(class_weight='balanced', random_state=RANDOM_STATE)
        svm.fit(X_train, y_aspects_train[:, j])
        svm_models_A[a] = svm
        svm_preds_A[:, j] = svm.predict(X_val)

    svm_models_B = {}
    svm_preds_B = {}
    for a in ASPECTS:
        train_indices = [i for i, l in enumerate(y_sentiments_train[a]) if l is not None]
        val_indices = [i for i, l in enumerate(y_sentiments_val[a]) if l is not None]
        if train_indices and val_indices:
            svm = LinearSVC(class_weight='balanced', random_state=RANDOM_STATE)
            svm.fit(X_train[train_indices], [y_sentiments_train[a][i] for i in train_indices])
            svm_models_B[a] = svm
            svm_preds_B[a] = svm.predict(X_val[val_indices])
        else:
            svm_preds_B[a] = []

    # ---------------- 5. Logistic Regression ----------------
    lr_preds_A = np.zeros_like(y_aspects_val)
    for j, a in enumerate(ASPECTS):
        probs = lr_models_A[a].predict_proba(X_val)[:, 1]
        lr_preds_A[:, j] = (probs >= lr_thresholds_A[a]).astype(int)

    lr_preds_B = {}
    for a in ASPECTS:
        val_indices = [i for i, l in enumerate(y_sentiments_val[a]) if l is not None]
        if val_indices:
            lr_preds_B[a] = lr_models_B[a].predict(X_val[val_indices])
        else:
            lr_preds_B[a] = []

    # Tổng hợp metric cho 5 mô hình trên VAL
    model_preds = {
        'Majority Class': (maj_preds_A, maj_preds_B),
        'Rule-based Từ khóa': (rule_preds_A, rule_preds_B),
        'Multinomial Naive Bayes': (nb_preds_A, nb_preds_B),
        'Linear SVM': (svm_preds_A, svm_preds_B),
        'Logistic Regression (Đề xuất)': (lr_preds_A, lr_preds_B)
    }

    comparison_table = []
    for name, (preds_A, preds_B) in model_preds.items():
        # Task A metrics
        f1_per_asp = [f1_score(y_aspects_val[:, j], preds_A[:, j], zero_division=0) for j in range(len(ASPECTS))]
        macro_f1_A = np.mean(f1_per_asp)
        micro_f1_A = f1_score(y_aspects_val, preds_A, average='micro', zero_division=0)

        # Task B metrics
        b_accs = []
        b_macro_f1s = []
        for a in ASPECTS:
            val_indices = [i for i, l in enumerate(y_sentiments_val[a]) if l is not None]
            if val_indices and len(preds_B[a]) > 0:
                y_true_b = [y_sentiments_val[a][i] for i in val_indices]
                acc = accuracy_score(y_true_b, preds_B[a])
                m_f1 = f1_score(y_true_b, preds_B[a], average='macro', zero_division=0)
                b_accs.append(acc)
                b_macro_f1s.append(m_f1)
        mean_acc_B = np.mean(b_accs) if b_accs else 0.0
        mean_f1_B = np.mean(b_macro_f1s) if b_macro_f1s else 0.0

        comparison_table.append({
            'model': name,
            'macro_f1_A': macro_f1_A,
            'micro_f1_A': micro_f1_A,
            'f1_aspects': f1_per_asp,
            'acc_B': mean_acc_B,
            'macro_f1_B': mean_f1_B
        })

    return comparison_table


def run_ablation_study(train_data, val_data, best_C_A, best_C_B):
    """
    Nghiên cứu Ablation trên VAL:
    1. Full model
    2. Bỏ char n-gram (chỉ dùng word 1-3)
    3. Bỏ bản không dấu
    4. Bỏ map teencode
    5. Bỏ giữ phủ định (loại bỏ từ phủ định như stopword)
    """
    variants = [
        ('Full Model (Word 1-3 + Char_wb 2-5 + Tiền xử lý chuẩn)', True, True, True, True),
        ('Ablation: Bỏ char n-gram (Word 1-3 TF-IDF only)', False, True, True, True),
        ('Ablation: Bỏ bản không dấu', True, False, True, True),
        ('Ablation: Bỏ map teencode', True, True, False, True),
        ('Ablation: Bỏ giữ phủ định (loại bỏ từ phủ định)', True, True, True, False),
    ]

    negation_stopwords = {'không', 'chẳng', 'chưa', 'hơi', 'chả', 'ko', 'k', 'đâu', 'hem', 'hổng'}
    y_train_A, y_train_B = extract_targets(train_data)
    y_val_A, y_val_B = extract_targets(val_data)

    ablation_results = []

    for name, use_char, use_unaccent, use_teencode, keep_negation in variants:
        def custom_preprocess(text):
            t = normalize_text_base(text)
            if not use_teencode:
                # khôi phục không map teencode bằng cách giữ text gốc lowercase nfc
                t = unicodedata.normalize('NFC', text).lower()
                t = re.sub(r'([a-zA-Z\u00C0-\u1EF9])\1{2,}', r'\1', t)
            if not keep_negation:
                words = t.split()
                words = [w for w in words if w not in negation_stopwords]
                t = ' '.join(words)
            if use_unaccent:
                unacc = remove_accents(t)
                return f"{t} {unacc}"
            return t

        train_texts = [custom_preprocess(r['content']) for r in train_data]
        val_texts = [custom_preprocess(r['content']) for r in val_data]

        word_vec = TfidfVectorizer(ngram_range=(1, 3), analyzer='word', sublinear_tf=True, token_pattern=r'(?u)\b\w+\b')
        if use_char:
            char_vec = TfidfVectorizer(ngram_range=(2, 5), analyzer='char_wb', sublinear_tf=True)
            union = FeatureUnion([('word', word_vec), ('char_wb', char_vec)])
        else:
            union = word_vec

        X_tr = union.fit_transform(train_texts)
        X_va = union.transform(val_texts)

        # Train Task A
        f1s_A = []
        for j, a in enumerate(ASPECTS):
            clf = LogisticRegression(C=best_C_A[a], penalty='l2', class_weight='balanced', solver='liblinear', random_state=RANDOM_STATE)
            clf.fit(X_tr, y_train_A[:, j])
            preds = clf.predict(X_va)
            f1s_A.append(f1_score(y_val_A[:, j], preds, zero_division=0))
        macro_f1_A = np.mean(f1s_A)

        # Train Task B
        f1s_B = []
        for a in ASPECTS:
            tr_idx = [i for i, l in enumerate(y_train_B[a]) if l is not None]
            va_idx = [i for i, l in enumerate(y_val_B[a]) if l is not None]
            if tr_idx and va_idx:
                clf = LogisticRegression(C=best_C_B[a], penalty='l2', class_weight='balanced', solver='lbfgs', random_state=RANDOM_STATE, max_iter=500)
                clf.fit(X_tr[tr_idx], [y_train_B[a][i] for i in tr_idx])
                preds = clf.predict(X_va[va_idx])
                f1s_B.append(f1_score([y_val_B[a][i] for i in va_idx], preds, average='macro', zero_division=0))
        macro_f1_B = np.mean(f1s_B) if f1s_B else 0.0

        ablation_results.append({
            'variant': name,
            'macro_f1_A': macro_f1_A,
            'macro_f1_B': macro_f1_B
        })

    return ablation_results


def run_learning_curve(X_train_full, y_aspects_train, X_val, y_aspects_val, best_C_A, thresholds_A):
    """
    Tính learning curve theo các tỷ lệ tập train: 20%, 40%, 60%, 80%, 100%.
    """
    fractions = [0.2, 0.4, 0.6, 0.8, 1.0]
    n_total = X_train_full.shape[0]
    curve_data = []

    for frac in fractions:
        n_samples = int(math.ceil(frac * n_total))
        # Lấy cố định n_samples đầu tiên theo train (giữ seed)
        X_sub = X_train_full[:n_samples]
        y_sub = y_aspects_train[:n_samples]

        train_f1s = []
        val_f1s = []

        for j, a in enumerate(ASPECTS):
            clf = LogisticRegression(C=best_C_A[a], penalty='l2', class_weight='balanced', solver='liblinear', random_state=RANDOM_STATE)
            clf.fit(X_sub, y_sub[:, j])

            p_tr = (clf.predict_proba(X_sub)[:, 1] >= thresholds_A[a]).astype(int)
            p_va = (clf.predict_proba(X_val)[:, 1] >= thresholds_A[a]).astype(int)

            train_f1s.append(f1_score(y_sub[:, j], p_tr, zero_division=0))
            val_f1s.append(f1_score(y_aspects_val[:, j], p_va, zero_division=0))

        curve_data.append({
            'fraction': int(frac * 100),
            'samples': n_samples,
            'train_macro_f1': float(np.mean(train_f1s)),
            'val_macro_f1': float(np.mean(val_f1s))
        })
    return curve_data


def evaluate_on_test_once(lr_models_A, lr_thresholds_A, lr_models_B, X_test, test_samples):
    """
    CHẠY ĐÚNG 1 LẦN TRÊN TẬP TEST Ở CUỐI:
    - F1 từng khía cạnh, macro/micro-F1 (Tác vụ A)
    - Accuracy, macro-F1 (Tác vụ B)
    - F1 theo nhóm văn phong: casual, formal, Bắc, Nam, teencode, không dấu, generic, ca khó
    - Confusion matrix
    - 10 lỗi điển hình mỗi tác vụ
    """
    y_test_A, y_test_B = extract_targets(test_samples)
    N = len(test_samples)

    # 1. Dự đoán Tác vụ A
    probs_A = np.zeros((N, len(ASPECTS)))
    preds_A = np.zeros((N, len(ASPECTS)), dtype=int)
    for j, a in enumerate(ASPECTS):
        probs_A[:, j] = lr_models_A[a].predict_proba(X_test)[:, 1]
        preds_A[:, j] = (probs_A[:, j] >= lr_thresholds_A[a]).astype(int)

    f1_A_aspects = {}
    p_A_aspects = {}
    r_A_aspects = {}
    for j, a in enumerate(ASPECTS):
        f1_A_aspects[a] = f1_score(y_test_A[:, j], preds_A[:, j], zero_division=0)
        p_A_aspects[a] = precision_score(y_test_A[:, j], preds_A[:, j], zero_division=0)
        r_A_aspects[a] = recall_score(y_test_A[:, j], preds_A[:, j], zero_division=0)

    macro_f1_A = np.mean(list(f1_A_aspects.values()))
    micro_f1_A = f1_score(y_test_A, preds_A, average='micro', zero_division=0)

    # Confusion matrix Tác vụ A
    cm_A = {}
    for j, a in enumerate(ASPECTS):
        cm = confusion_matrix(y_test_A[:, j], preds_A[:, j], labels=[0, 1])
        cm_A[a] = cm.tolist()

    # 2. Dự đoán Tác vụ B
    preds_B = {}
    acc_B = {}
    macro_f1_B = {}
    cm_B = {}
    for a in ASPECTS:
        test_indices = [i for i, l in enumerate(y_test_B[a]) if l is not None]
        if test_indices:
            y_true_b = [y_test_B[a][i] for i in test_indices]
            p_b = lr_models_B[a].predict(X_test[test_indices])
            preds_B[a] = {i: pred for i, pred in zip(test_indices, p_b)}
            acc_B[a] = accuracy_score(y_true_b, p_b)
            macro_f1_B[a] = f1_score(y_true_b, p_b, average='macro', zero_division=0)
            cm = confusion_matrix(y_true_b, p_b, labels=['pos', 'neg', 'neu'])
            cm_B[a] = cm.tolist()
        else:
            preds_B[a] = {}
            acc_B[a] = 0.0
            macro_f1_B[a] = 0.0
            cm_B[a] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]

    mean_acc_B = np.mean(list(acc_B.values()))
    mean_macro_f1_B = np.mean(list(macro_f1_B.values()))

    # 3. Phân rã theo phong cách ngôn ngữ
    styles_list = ['casual', 'formal', 'northern', 'southern', 'teencode', 'no_accent', 'generic', 'tricky', 'short']
    style_names = {
        'casual': 'Đời thường (casual)',
        'formal': 'Trang trọng (formal)',
        'northern': 'Giọng Bắc (northern)',
        'southern': 'Giọng Nam (southern)',
        'teencode': 'Teencode (teencode)',
        'no_accent': 'Không dấu (no_accent)',
        'generic': 'Chung chung (generic - 0 khía cạnh)',
        'tricky': 'Ca khó (tricky - phủ định kép / mỉa mai)',
        'short': 'Ngắn gọn (short)'
    }

    style_metrics = {}
    for st in styles_list:
        st_indices = [i for i, r in enumerate(test_samples) if r['style'] == st]
        if not st_indices:
            continue
        st_y_A = y_test_A[st_indices]
        st_p_A = preds_A[st_indices]

        # Task A Macro F1
        st_f1s = [f1_score(st_y_A[:, j], st_p_A[:, j], zero_division=0) for j in range(len(ASPECTS))]
        st_macro_A = float(np.mean(st_f1s))
        st_micro_A = float(f1_score(st_y_A, st_p_A, average='micro', zero_division=0))

        # Task B
        st_b_accs = []
        st_b_f1s = []
        for a in ASPECTS:
            st_b_idx = [i for i in st_indices if y_test_B[a][i] is not None]
            if st_b_idx and a in preds_B:
                y_sub = [y_test_B[a][i] for i in st_b_idx]
                p_sub = [preds_B[a][i] for i in st_b_idx]
                st_b_accs.append(accuracy_score(y_sub, p_sub))
                st_b_f1s.append(f1_score(y_sub, p_sub, average='macro', zero_division=0))
        st_acc_B = float(np.mean(st_b_accs)) if st_b_accs else 0.0
        st_macro_B = float(np.mean(st_b_f1s)) if st_b_f1s else 0.0

        style_metrics[st] = {
            'name': style_names[st],
            'count': len(st_indices),
            'macro_f1_A': st_macro_A,
            'micro_f1_A': st_micro_A,
            'acc_B': st_acc_B,
            'macro_f1_B': st_macro_B
        }

    # 4. Tìm 10 lỗi điển hình mỗi tác vụ
    # Lỗi Tác vụ A: False Positive hoặc False Negative
    errors_A = []
    for i, r in enumerate(test_samples):
        for j, a in enumerate(ASPECTS):
            true_v = y_test_A[i, j]
            pred_v = preds_A[i, j]
            if true_v != pred_v:
                errors_A.append({
                    'id': r['id'],
                    'style': r['style'],
                    'content': r['content'],
                    'aspect': a,
                    'true_status': 'CÓ' if true_v == 1 else 'KHÔNG',
                    'pred_status': 'CÓ' if pred_v == 1 else 'KHÔNG',
                    'prob': float(round(probs_A[i, j], 4)),
                    'threshold': lr_thresholds_A[a],
                    'error_type': 'False Positive (nhận diện thừa)' if pred_v == 1 else 'False Negative (bỏ sót)'
                })

    # Lỗi Tác vụ B: Sai cực tính
    errors_B = []
    for a in ASPECTS:
        test_indices = [i for i, l in enumerate(y_test_B[a]) if l is not None]
        for i in test_indices:
            r = test_samples[i]
            true_s = y_test_B[a][i]
            pred_s = preds_B[a][i]
            if true_s != pred_s:
                errors_B.append({
                    'id': r['id'],
                    'style': r['style'],
                    'content': r['content'],
                    'aspect': a,
                    'true_sentiment': true_s,
                    'pred_sentiment': pred_s
                })

    return {
        'macro_f1_A': macro_f1_A,
        'micro_f1_A': micro_f1_A,
        'f1_A_aspects': f1_A_aspects,
        'p_A_aspects': p_A_aspects,
        'r_A_aspects': r_A_aspects,
        'cm_A': cm_A,
        'mean_acc_B': mean_acc_B,
        'mean_macro_f1_B': mean_macro_f1_B,
        'acc_B': acc_B,
        'macro_f1_B': macro_f1_B,
        'cm_B': cm_B,
        'style_metrics': style_metrics,
        'errors_A': errors_A[:10],
        'errors_B': errors_B[:10],
        'total_errors_A': len(errors_A),
        'total_errors_B': len(errors_B)
    }


def export_models(feature_union, lr_models_A, lr_thresholds_A, lr_models_B):
    """
    Xuất vocab + idf + hệ số + intercept + ngưỡng ra models/*.json
    để services/aspectInference.js có thể nạp và suy luận độc lập.
    """
    word_vec = feature_union.transformer_list[0][1]
    char_vec = feature_union.transformer_list[1][1]

    # Model A: Aspect Detection
    model_A_data = {
        'aspects': ASPECTS,
        'thresholds': lr_thresholds_A,
        'word_features': {
            'ngram_range': [1, 3],
            'vocab': {k: int(v) for k, v in word_vec.vocabulary_.items()},
            'idf': [float(v) for v in word_vec.idf_]
        },
        'char_features': {
            'ngram_range': [2, 5],
            'vocab': {k: int(v) for k, v in char_vec.vocabulary_.items()},
            'idf': [float(v) for v in char_vec.idf_]
        },
        'weights': {}
    }

    n_word = len(word_vec.idf_)
    for a in ASPECTS:
        clf = lr_models_A[a]
        coef = clf.coef_[0]
        intercept = float(clf.intercept_[0])
        model_A_data['weights'][a] = {
            'intercept': intercept,
            'word_coef': [float(round(c, 6)) for c in coef[:n_word]],
            'char_coef': [float(round(c, 6)) for c in coef[n_word:]]
        }

    det_file = os.path.join(MODELS_DIR, 'aspect_detection.json')
    with open(det_file, 'w', encoding='utf-8') as f:
        json.dump(model_A_data, f, ensure_ascii=False)
    print(f"\n[Export] Đã xuất {det_file} ({os.path.getsize(det_file) // 1024} KB)")

    # Model B: Aspect Sentiment
    model_B_data = {
        'aspects': ASPECTS,
        'word_features': {
            'ngram_range': [1, 3],
            'vocab': {k: int(v) for k, v in word_vec.vocabulary_.items()},
            'idf': [float(v) for v in word_vec.idf_]
        },
        'char_features': {
            'ngram_range': [2, 5],
            'vocab': {k: int(v) for k, v in char_vec.vocabulary_.items()},
            'idf': [float(v) for v in char_vec.idf_]
        },
        'weights': {}
    }

    for a in ASPECTS:
        clf = lr_models_B[a]
        classes = clf.classes_.tolist()
        intercepts = [float(v) for v in clf.intercept_]
        class_weights = {}
        for idx, cls in enumerate(classes):
            coef = clf.coef_[idx]
            class_weights[cls] = {
                'intercept': intercepts[idx],
                'word_coef': [float(round(c, 6)) for c in coef[:n_word]],
                'char_coef': [float(round(c, 6)) for c in coef[n_word:]]
            }
        model_B_data['weights'][a] = {
            'classes': classes,
            'class_weights': class_weights
        }

    sent_file = os.path.join(MODELS_DIR, 'aspect_sentiment.json')
    with open(sent_file, 'w', encoding='utf-8') as f:
        json.dump(model_B_data, f, ensure_ascii=False)
    print(f"[Export] Đã xuất {sent_file} ({os.path.getsize(sent_file) // 1024} KB)")


def main():
    print("==================================================================")
    print("   BẮT ĐẦU HUẤN LUYỆN & ĐÁNH GIÁ MÔ HÌNH HỌC MÁY (PHẦN 3)         ")
    print("==================================================================")

    # 1. Nạp Dataset
    data = load_dataset()
    print(f"Tổng số mẫu nạp từ {DATA_FILE}: {len(data)}")

    # Thống kê phân bố
    dist = analyze_dataset_distribution(data)
    print("\n--- Phân bố mẫu theo tập chia (Splits) ---")
    for s in ['train', 'val', 'test']:
        print(f"Split [{s}]: {dist[s]['total']} mẫu")

    train_samples = [r for r in data if r['split'] == 'train']
    val_samples = [r for r in data if r['split'] == 'val']
    test_samples = [r for r in data if r['split'] == 'test']

    # 2. Tiền xử lý
    print("\n[Tiền xử lý] Đang chuẩn hóa văn bản với ml/preprocess.py...")
    train_texts = [preprocess_text(r['content']) for r in train_samples]
    val_texts = [preprocess_text(r['content']) for r in val_samples]
    test_texts = [preprocess_text(r['content']) for r in test_samples]

    raw_val_texts = [r['content'] for r in val_samples]
    raw_test_texts = [r['content'] for r in test_samples]

    # Trích xuất nhãn
    y_train_A, y_train_B = extract_targets(train_samples)
    y_val_A, y_val_B = extract_targets(val_samples)
    train_providers = [r['providerId'] for r in train_samples]

    # 3. Trích xuất đặc trưng TF-IDF (Fit CHỈ trên train)
    print("\n[Đặc trưng] Khởi tạo TF-IDF FeatureUnion (word 1-3 + char_wb 2-5, sublinear_tf=True)...")
    word_vec = TfidfVectorizer(
        ngram_range=(1, 3), analyzer='word', sublinear_tf=True, min_df=2,
        max_df=0.98, token_pattern=r'(?u)\b\w+\b'
    )
    char_vec = TfidfVectorizer(
        ngram_range=(2, 5), analyzer='char_wb', sublinear_tf=True, min_df=2,
        max_df=0.98
    )
    feature_union = FeatureUnion([
        ('word', word_vec),
        ('char_wb', char_vec)
    ])

    X_train = feature_union.fit_transform(train_texts)
    X_val = feature_union.transform(val_texts)
    X_test = feature_union.transform(test_texts)
    print(f"  Shape X_train: {X_train.shape}")
    print(f"  Shape X_val:   {X_val.shape}")
    print(f"  Shape X_test:  {X_test.shape}")

    # 4. Tìm tham số bằng GridSearch + GroupKFold(providerId) trên train
    best_C_A, best_C_B = tune_logistic_regression(X_train, y_train_A, y_train_B, train_providers)

    # 5. Huấn luyện mô hình Logistic Regression chính trên toàn bộ train
    print("\n[Huấn luyện] Fit mô hình Logistic Regression chính trên toàn bộ Train...")
    lr_models_A = {}
    for j, a in enumerate(ASPECTS):
        clf = LogisticRegression(
            C=best_C_A[a], penalty='l2', class_weight='balanced',
            solver='liblinear', random_state=RANDOM_STATE
        )
        clf.fit(X_train, y_train_A[:, j])
        lr_models_A[a] = clf

    lr_models_B = {}
    for a in ASPECTS:
        train_indices = [i for i, l in enumerate(y_train_B[a]) if l is not None]
        clf = LogisticRegression(
            C=best_C_B[a], penalty='l2', class_weight='balanced',
            solver='lbfgs', random_state=RANDOM_STATE, max_iter=500
        )
        clf.fit(X_train[train_indices], [y_train_B[a][i] for i in train_indices])
        lr_models_B[a] = clf

    # 6. Chốt ngưỡng trên VAL
    lr_thresholds_A = tune_thresholds_on_val(lr_models_A, X_val, y_val_A)

    # 7. Đánh giá và so sánh 5 mô hình trên VAL
    print("\n[So sánh] Đánh giá 5 mô hình trên tập VAL...")
    rule_model = RuleBasedAspectModel(LEXICON_FILE)
    val_comparison = evaluate_baselines_on_val(
        X_train, y_train_A, y_train_B,
        X_val, y_val_A, y_val_B,
        raw_val_texts, rule_model,
        lr_models_A, lr_thresholds_A, lr_models_B
    )
    print("\n=== BẢNG SO SÁNH 5 MÔ HÌNH TRÊN TẬP VAL ===")
    for row in val_comparison:
        print(f"  {row['model']:30s} | Task A Macro-F1: {row['macro_f1_A']:.4f} (Micro: {row['micro_f1_A']:.4f}) | Task B Macro-F1: {row['macro_f1_B']:.4f} (Acc: {row['acc_B']:.4f})")

    # 8. Nghiên cứu Ablation
    print("\n[Ablation] Đang chạy nghiên cứu thành phần trên VAL...")
    ablation_results = run_ablation_study(train_samples, val_samples, best_C_A, best_C_B)
    for ab in ablation_results:
        print(f"  {ab['variant']:60s} | A Macro-F1: {ab['macro_f1_A']:.4f} | B Macro-F1: {ab['macro_f1_B']:.4f}")

    # 9. Learning Curve
    print("\n[Learning Curve] Đang tính learning curve theo kích thước train...")
    learning_curve_data = run_learning_curve(X_train, y_train_A, X_val, y_val_A, best_C_A, lr_thresholds_A)
    for lc in learning_curve_data:
        print(f"  Train {lc['fraction']}% ({lc['samples']} samples) -> Train Macro-F1: {lc['train_macro_f1']:.4f} | Val Macro-F1: {lc['val_macro_f1']:.4f}")

    # 10. ĐÁNH GIÁ TRÊN TEST (ĐÚNG 1 LẦN Ở CUỐI)
    print("\n" + "=" * 66)
    print("   CHẠY ĐÁNH GIÁ DUY NHẤT 1 LẦN TRÊN TẬP TEST (81 MẪU)           ")
    print("=" * 66)
    test_results = evaluate_on_test_once(lr_models_A, lr_thresholds_A, lr_models_B, X_test, test_samples)

    print(f"\n[Test Kết quả Tác vụ A - Aspect Detection]")
    print(f"  Macro-F1: {test_results['macro_f1_A']:.4f} | Micro-F1: {test_results['micro_f1_A']:.4f}")
    for a in ASPECTS:
        print(f"    - {a:10s}: F1 = {test_results['f1_A_aspects'][a]:.4f} (P = {test_results['p_A_aspects'][a]:.4f}, R = {test_results['r_A_aspects'][a]:.4f})")

    print(f"\n[Test Kết quả Tác vụ B - Aspect Sentiment]")
    print(f"  Mean Accuracy: {test_results['mean_acc_B']:.4f} | Mean Macro-F1: {test_results['mean_macro_f1_B']:.4f}")
    for a in ASPECTS:
        print(f"    - {a:10s}: Acc = {test_results['acc_B'][a]:.4f} | Macro-F1 = {test_results['macro_f1_B'][a]:.4f}")

    print("\n[Test Kết quả theo Văn phong]")
    for st, met in test_results['style_metrics'].items():
        print(f"  {met['name']:35s} ({met['count']:2d} mẫu) | A Macro-F1: {met['macro_f1_A']:.4f} | B Macro-F1: {met['macro_f1_B']:.4f}")

    # 11. Xuất mô hình ra models/*.json
    export_models(feature_union, lr_models_A, lr_thresholds_A, lr_models_B)

    # 12. Lưu toàn bộ kết quả ra JSON trung gian để tiện sinh báo cáo markdown
    eval_summary = {
        'dist': dist,
        'val_comparison': val_comparison,
        'best_C_A': best_C_A,
        'best_C_B': best_C_B,
        'lr_thresholds_A': lr_thresholds_A,
        'ablation': ablation_results,
        'learning_curve': learning_curve_data,
        'test_results': test_results
    }
    summary_path = os.path.join(REPORTS_DIR, 'eval_results.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(eval_summary, f, ensure_ascii=False, indent=2)
    print(f"\n[Kết quả] Đã lưu thông số chi tiết: {summary_path}")
    print("\n=== HOÀN THÀNH QUÁ TRÌNH HUẤN LUYỆN VÀ ĐÁNH GIÁ ML ===")


if __name__ == '__main__':
    main()
