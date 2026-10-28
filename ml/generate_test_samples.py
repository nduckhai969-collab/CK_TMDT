"""
ml/generate_test_samples.py
Trích xuất 20 câu đánh giá đa dạng và tính toán chính xác xác suất từ mô hình scikit-learn
để làm bộ benchmark kiểm thử so sánh độ lệch giữa Node.js và Python.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
from collections import Counter
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression

from ml.preprocess import preprocess_text
from ml.train import load_dataset, extract_targets, ASPECTS, RANDOM_STATE

DATA_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'export', 'reviews_labeled.json')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'python_inference_samples.json')

def main():
    data = load_dataset()
    train_samples = [r for r in data if r['split'] == 'train']
    test_samples = [r for r in data if r['split'] == 'test']

    # Chọn 20 câu đại diện trải đều các phong cách (formal, casual, northern, southern, teencode, no_accent, tricky, short, generic)
    selected_samples = []
    seen_styles = Counter()
    for r in test_samples:
        if seen_styles[r['style']] < 3 and len(selected_samples) < 20:
            selected_samples.append(r)
            seen_styles[r['style']] += 1
    
    # Nếu chưa đủ 20 câu thì lấy thêm cho đủ
    for r in test_samples:
        if len(selected_samples) >= 20:
            break
        if r not in selected_samples:
            selected_samples.append(r)

    print(f"Đã chọn {len(selected_samples)} câu mẫu để đối soát.")

    # Nạp lại vectorizer và train Logistic Regression như ml/train.py
    train_texts = [preprocess_text(r['content']) for r in train_samples]
    y_train_A, y_train_B = extract_targets(train_samples)

    word_vec = TfidfVectorizer(
        ngram_range=(1, 3), analyzer='word', sublinear_tf=True, token_pattern=r'(?u)\b\w+\b'
    )
    char_vec = TfidfVectorizer(
        ngram_range=(2, 5), analyzer='char_wb', sublinear_tf=True
    )
    feature_union = FeatureUnion([
        ('word', word_vec),
        ('char_wb', char_vec)
    ])
    X_train = feature_union.fit_transform(train_texts)

    # Nạp best C từ eval_results.json
    eval_res = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'reports', 'eval_results.json'), encoding='utf-8'))
    best_C_A = eval_res['best_C_A']
    best_C_B = eval_res['best_C_B']
    lr_thresholds_A = eval_res['lr_thresholds_A']

    # Fit Model A
    models_A = {}
    for j, a in enumerate(ASPECTS):
        clf = LogisticRegression(C=best_C_A[a], penalty='l2', class_weight='balanced', solver='liblinear', random_state=RANDOM_STATE)
        clf.fit(X_train, y_train_A[:, j])
        models_A[a] = clf

    # Fit Model B
    models_B = {}
    for a in ASPECTS:
        train_indices = [i for i, l in enumerate(y_train_B[a]) if l is not None]
        clf = LogisticRegression(C=best_C_B[a], penalty='l2', class_weight='balanced', solver='lbfgs', random_state=RANDOM_STATE, max_iter=500)
        clf.fit(X_train[train_indices], [y_train_B[a][i] for i in train_indices])
        models_B[a] = clf

    # Tính toán xác suất trên 20 câu
    bench_data = []
    for s in selected_samples:
        raw_text = s['content']
        clean_text = preprocess_text(raw_text)
        X_item = feature_union.transform([clean_text])

        item_result = {
            'id': s['id'],
            'style': s['style'],
            'content': raw_text,
            'preprocessed': clean_text,
            'aspect_probs': {},
            'aspect_preds': {},
            'sentiment_probs': {}
        }

        for j, a in enumerate(ASPECTS):
            prob = float(models_A[a].predict_proba(X_item)[0, 1])
            is_present = bool(prob >= lr_thresholds_A[a])
            item_result['aspect_probs'][a] = prob
            item_result['aspect_preds'][a] = is_present

            clf_b = models_B[a]
            probs_b = clf_b.predict_proba(X_item)[0]
            classes_b = clf_b.classes_.tolist()
            item_result['sentiment_probs'][a] = {
                cls: float(probs_b[k]) for k, cls in enumerate(classes_b)
            }

        bench_data.append(item_result)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(bench_data, f, ensure_ascii=False, indent=2)

    print(f"Đã lưu kết quả suy luận Python vào: {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
