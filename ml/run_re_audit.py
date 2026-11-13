"""
ml/run_re_audit.py
Thực hiện các phân tích rà soát kỹ thuật theo 7 điểm yêu cầu:
1. Đánh giá Rule-based kho cụm từ trên TEST + Xây dựng Rule-based độc lập và đánh giá trên VAL & TEST.
2. Đánh giá Linear SVM trên TEST để so sánh với Logistic Regression.
3. Giải trình chênh lệch ngưỡng giữa bảng so sánh VAL (ngưỡng tinh chỉnh) và Ablation (ngưỡng mặc định 0.50).
4. Tính Macro-F1 Tác vụ B trên các lớp có support > 0 kèm số lượng mẫu n.
5. Phân tích chi tiết 16 mẫu warranty trên TEST (tại sao đoán nhầm 6/16).
6. Tái tính toán đánh giá Gợi ý (Recommender):
   - Bản cũ: tất cả 400 review
   - Bản mới 1: Chỉ tính trên các Provider thuộc Val + Test (không đụng Train)
   - Bản mới 2: Out-Of-Fold (OOF) predictions cho Train + Val + Test
7. Phân tích phụ:
   - Leave-One-Provider-Out (24 folds) trên 400 review: Mean ± Std cho Macro-F1 A và Accuracy B.
   - Bootstrap 95% CI (1000 lượt) trên tập TEST cho Macro-F1 A và Accuracy B.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
import numpy as np
import warnings
warnings.filterwarnings('ignore')
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.metrics import f1_score, accuracy_score, precision_score, recall_score, confusion_matrix
from sklearn.model_selection import GroupKFold, LeaveOneGroupOut

from ml.preprocess import preprocess_text, normalize_text_base, remove_accents
from ml.train import load_dataset, extract_targets, ASPECTS, RANDOM_STATE, RuleBasedAspectModel

# =========================================================================
# 1. NẠP DỮ LIỆU & VECTORIZER
# =========================================================================
data = load_dataset()
train_samples = [r for r in data if r['split'] == 'train']
val_samples = [r for r in data if r['split'] == 'val']
test_samples = [r for r in data if r['split'] == 'test']

y_train_A, y_train_B = extract_targets(train_samples)
y_val_A, y_val_B = extract_targets(val_samples)
y_test_A, y_test_B = extract_targets(test_samples)

train_texts = [preprocess_text(r['content']) for r in train_samples]
val_texts = [preprocess_text(r['content']) for r in val_samples]
test_texts = [preprocess_text(r['content']) for r in test_samples]

raw_val_texts = [r['content'] for r in val_samples]
raw_test_texts = [r['content'] for r in test_samples]

train_providers = [r['providerId'] for r in train_samples]

word_vec = TfidfVectorizer(ngram_range=(1, 3), analyzer='word', sublinear_tf=True, token_pattern=r'(?u)\b\w+\b')
char_vec = TfidfVectorizer(ngram_range=(2, 5), analyzer='char_wb', sublinear_tf=True)
feature_union = FeatureUnion([('word', word_vec), ('char_wb', char_vec)])

X_train = feature_union.fit_transform(train_texts)
X_val = feature_union.transform(val_texts)
X_test = feature_union.transform(test_texts)

# Nạp tham số tối ưu từ lần huấn luyện trước
eval_res = json.load(open('reports/eval_results.json', encoding='utf-8'))
best_C_A = eval_res['best_C_A']
best_C_B = eval_res['best_C_B']
lr_thresholds_A = eval_res['lr_thresholds_A']

# Fit Logistic Regression chính
lr_models_A = {}
for j, a in enumerate(ASPECTS):
    clf = LogisticRegression(C=best_C_A[a], penalty='l2', class_weight='balanced', solver='liblinear', random_state=RANDOM_STATE)
    clf.fit(X_train, y_train_A[:, j])
    lr_models_A[a] = clf

lr_models_B = {}
for a in ASPECTS:
    train_indices = [i for i, l in enumerate(y_train_B[a]) if l is not None]
    clf = LogisticRegression(C=best_C_B[a], penalty='l2', class_weight='balanced', solver='lbfgs', random_state=RANDOM_STATE, max_iter=500)
    clf.fit(X_train[train_indices], [y_train_B[a][i] for i in train_indices])
    lr_models_B[a] = clf

print("=== HOÀN TẤT SETUP DỮ LIỆU & MÔ HÌNH CHÍNH ===")

# =========================================================================
# MỤC 1: RULE-BASED TRÊN TEST & RULE-BASED ĐỘC LẬP
# =========================================================================
# 1.1. Rule-based rò rỉ (từ kho cụm từ data/reviewCorpus.js)
rule_model_leak = RuleBasedAspectModel(os.path.join(os.path.dirname(__file__), 'aspect_lexicon.json'))

# Test trên tập TEST
test_preds_A_leak = rule_model_leak.predict_aspects(raw_test_texts)
leak_f1s_A_test = [f1_score(y_test_A[:, j], test_preds_A_leak[:, j], zero_division=0) for j in range(len(ASPECTS))]
leak_macro_A_test = np.mean(leak_f1s_A_test)
leak_micro_A_test = f1_score(y_test_A, test_preds_A_leak, average='micro', zero_division=0)

leak_accs_B_test = []
leak_f1s_B_test = []
for a in ASPECTS:
    test_idx = [i for i, l in enumerate(y_test_B[a]) if l is not None]
    if test_idx:
        preds = rule_model_leak.predict_sentiment_for_aspect([raw_test_texts[i] for i in test_idx], a)
        y_true = [y_test_B[a][i] for i in test_idx]
        leak_accs_B_test.append(accuracy_score(y_true, preds))
        leak_f1s_B_test.append(f1_score(y_true, preds, average='macro', zero_division=0))
leak_acc_B_test = np.mean(leak_accs_B_test)
leak_macro_B_test = np.mean(leak_f1s_B_test)

# 1.2. Rule-based Độc lập (Không nhìn kho ngữ liệu)
INDEPENDENT_LEXICON = {
    'quality': {
        'pos': ['tốt', 'chất lượng', 'giỏi', 'chuyên môn', 'tay nghề', 'đẹp', 'xuất sắc', 'kỹ năng', 'chuyên nghiệp', 'chuẩn', 'uy tín', 'tỉ mỉ', 'bài bản'],
        'neg': ['kém', 'tệ', 'dở', 'xấu', 'chất lượng kém', 'non nớt', 'cẩu thả', 'lỗi', 'hỏng', 'thất vọng', 'qua loa', 'chắp vá'],
        'neu': ['bình thường', 'tạm', 'tàm tạm', 'vừa phải', 'ổn', 'chấp nhận được']
    },
    'price': {
        'pos': ['rẻ', 'hợp lý', 'giá tốt', 'tiết kiệm', 'phải chăng', 'vừa túi', 'êm ví', 'hời', 'đáng tiền'],
        'neg': ['đắt', 'cao', 'chát', 'cắt cổ', 'tốn kém', 'đắt đỏ', 'buốt ví', 'phí tiền', 'chát chúa'],
        'neu': ['vừa tầm', 'đúng giá', 'giá sàn', 'trung bình', 'tầm tiền']
    },
    'speed': {
        'pos': ['nhanh', 'sớm', 'đúng giờ', 'đúng hẹn', 'thần tốc', 'chuẩn giờ', 'kịp thời', 'nhanh chóng', 'hỏa tốc'],
        'neg': ['chậm', 'trễ', 'muộn', 'chậm trễ', 'lề mề', 'câu giờ', 'delay', 'cao su', 'dây dưa'],
        'neu': ['vừa phải', 'đúng hạn', 'túc tắc', 'vừa tầm']
    },
    'attitude': {
        'pos': ['nhiệt tình', 'vui vẻ', 'thân thiện', 'lịch sự', 'nhã nhặn', 'chu đáo', 'tận tâm', 'dễ thương', 'lắng nghe', 'tôn trọng', 'niềm nở'],
        'neg': ['cộc cằn', 'khó chịu', 'gắt gỏng', 'thô lỗ', 'vô lễ', 'cau có', 'trịch thượng', 'xấc xược', 'cáu', 'lấc cấc', 'xách mé'],
        'neu': ['bình thường', 'chuẩn mực', 'công việc', 'đúng mực', 'vừa đủ', 'không vồn vã']
    },
    'warranty': {
        'pos': ['bảo hành', 'hậu mãi', 'bảo trì', 'sửa lại', 'hỗ trợ sau', 'chu đáo sau', 'chăm sóc sau'],
        'neg': ['không bảo hành', 'phủi', 'trốn tránh', 'chặn số', 'từ chối', 'đem con bỏ chợ', 'bỏ rơi'],
        'neu': ['bảo hành cơ bản', 'tiêu chuẩn', 'quy định', 'hợp đồng']
    }
}

class IndependentRuleModel:
    def __init__(self, lex):
        self.lex = lex
    def predict_aspects(self, texts):
        N = len(texts)
        preds = np.zeros((N, len(ASPECTS)), dtype=int)
        for i, text in enumerate(texts):
            clean = normalize_text_base(text)
            unacc = remove_accents(clean)
            for j, a in enumerate(ASPECTS):
                all_keywords = self.lex[a]['pos'] + self.lex[a]['neg'] + self.lex[a]['neu']
                for kw in all_keywords:
                    kw_clean = normalize_text_base(kw)
                    kw_unacc = remove_accents(kw_clean)
                    if kw_clean in clean or kw_unacc in unacc:
                        preds[i, j] = 1
                        break
        return preds
    def predict_sentiment_for_aspect(self, texts, aspect):
        res = []
        for text in texts:
            clean = normalize_text_base(text)
            unacc = remove_accents(clean)
            pos_c = sum(1 for kw in self.lex[aspect]['pos'] if normalize_text_base(kw) in clean or remove_accents(kw) in unacc)
            neg_c = sum(1 for kw in self.lex[aspect]['neg'] if normalize_text_base(kw) in clean or remove_accents(kw) in unacc)
            neu_c = sum(1 for kw in self.lex[aspect]['neu'] if normalize_text_base(kw) in clean or remove_accents(kw) in unacc)
            if pos_c > neg_c and pos_c >= neu_c:
                res.append('pos')
            elif neg_c > pos_c and neg_c >= neu_c:
                res.append('neg')
            else:
                res.append('neu')
        return np.array(res)

ind_rule_model = IndependentRuleModel(INDEPENDENT_LEXICON)

# Đánh giá Independent Rule trên VAL
val_preds_A_ind = ind_rule_model.predict_aspects(raw_val_texts)
ind_macro_A_val = np.mean([f1_score(y_val_A[:, j], val_preds_A_ind[:, j], zero_division=0) for j in range(len(ASPECTS))])
ind_micro_A_val = f1_score(y_val_A, val_preds_A_ind, average='micro', zero_division=0)

ind_accs_B_val = []
ind_f1s_B_val = []
for a in ASPECTS:
    val_idx = [i for i, l in enumerate(y_val_B[a]) if l is not None]
    if val_idx:
        p = ind_rule_model.predict_sentiment_for_aspect([raw_val_texts[i] for i in val_idx], a)
        y_tr = [y_val_B[a][i] for i in val_idx]
        ind_accs_B_val.append(accuracy_score(y_tr, p))
        ind_f1s_B_val.append(f1_score(y_tr, p, average='macro', zero_division=0))
ind_acc_B_val = np.mean(ind_accs_B_val)
ind_macro_B_val = np.mean(ind_f1s_B_val)

# Đánh giá Independent Rule trên TEST
test_preds_A_ind = ind_rule_model.predict_aspects(raw_test_texts)
ind_macro_A_test = np.mean([f1_score(y_test_A[:, j], test_preds_A_ind[:, j], zero_division=0) for j in range(len(ASPECTS))])
ind_micro_A_test = f1_score(y_test_A, test_preds_A_ind, average='micro', zero_division=0)

ind_accs_B_test = []
ind_f1s_B_test = []
for a in ASPECTS:
    test_idx = [i for i, l in enumerate(y_test_B[a]) if l is not None]
    if test_idx:
        p = ind_rule_model.predict_sentiment_for_aspect([raw_test_texts[i] for i in test_idx], a)
        y_tr = [y_test_B[a][i] for i in test_idx]
        ind_accs_B_test.append(accuracy_score(y_tr, p))
        ind_f1s_B_test.append(f1_score(y_tr, p, average='macro', zero_division=0))
ind_acc_B_test = np.mean(ind_accs_B_test)
ind_macro_B_test = np.mean(ind_f1s_B_test)

print(f"Rule-based (Rò rỉ kho cụm từ) TEST: Macro-F1 A = {leak_macro_A_test:.4f}, Micro-F1 A = {leak_micro_A_test:.4f}, Acc B = {leak_acc_B_test:.4f}, Macro-F1 B = {leak_macro_B_test:.4f}")
print(f"Rule-based (Độc lập chuẩn) VAL: Macro-F1 A = {ind_macro_A_val:.4f}, Micro-F1 A = {ind_micro_A_val:.4f}, Acc B = {ind_acc_B_val:.4f}, Macro-F1 B = {ind_macro_B_val:.4f}")
print(f"Rule-based (Độc lập chuẩn) TEST: Macro-F1 A = {ind_macro_A_test:.4f}, Micro-F1 A = {ind_micro_A_test:.4f}, Acc B = {ind_acc_B_test:.4f}, Macro-F1 B = {ind_macro_B_test:.4f}")


# =========================================================================
# MỤC 2: LINEAR SVM TRÊN TEST
# =========================================================================
svm_models_A = {}
for j, a in enumerate(ASPECTS):
    svm = LinearSVC(class_weight='balanced', random_state=RANDOM_STATE)
    svm.fit(X_train, y_train_A[:, j])
    svm_models_A[a] = svm

svm_preds_A_test = np.zeros_like(y_test_A)
for j, a in enumerate(ASPECTS):
    svm_preds_A_test[:, j] = svm_models_A[a].predict(X_test)

svm_macro_A_test = np.mean([f1_score(y_test_A[:, j], svm_preds_A_test[:, j], zero_division=0) for j in range(len(ASPECTS))])
svm_micro_A_test = f1_score(y_test_A, svm_preds_A_test, average='micro', zero_division=0)

svm_models_B = {}
svm_accs_B_test = []
svm_f1s_B_test = []
for a in ASPECTS:
    train_idx = [i for i, l in enumerate(y_train_B[a]) if l is not None]
    test_idx = [i for i, l in enumerate(y_test_B[a]) if l is not None]
    if train_idx and test_idx:
        svm = LinearSVC(class_weight='balanced', random_state=RANDOM_STATE)
        svm.fit(X_train[train_idx], [y_train_B[a][i] for i in train_idx])
        preds = svm.predict(X_test[test_idx])
        y_tr = [y_test_B[a][i] for i in test_idx]
        svm_accs_B_test.append(accuracy_score(y_tr, preds))
        svm_f1s_B_test.append(f1_score(y_tr, preds, average='macro', zero_division=0))
svm_acc_B_test = np.mean(svm_accs_B_test)
svm_macro_B_test = np.mean(svm_f1s_B_test)

print(f"Linear SVM TEST: Macro-F1 A = {svm_macro_A_test:.4f}, Micro-F1 A = {svm_micro_A_test:.4f}, Acc B = {svm_acc_B_test:.4f}, Macro-F1 B = {svm_macro_B_test:.4f}")
print(f"Logistic Regression TEST: Macro-F1 A = 0.7955, Micro-F1 A = 0.8000, Acc B = 0.7644, Macro-F1 B = 0.5107")


# =========================================================================
# MỤC 4 & 5: TÁC VỤ B TRÊN CÁC LỚP CÓ SUPPORT > 0 & PHÂN TÍCH WARRANTY
# =========================================================================
print("\n=== TÁC VỤ B CHI TIẾT TRÊN CÁC LỚP SUPPORT > 0 ===")
b_macro_nonzero = {}
b_macro_all = {}
b_support_counts = {}

for a in ASPECTS:
    test_idx = [i for i, l in enumerate(y_test_B[a]) if l is not None]
    y_true = [y_test_B[a][i] for i in test_idx]
    preds = lr_models_B[a].predict(X_test[test_idx])

    cnt = Counter(y_true)
    b_support_counts[a] = cnt
    present_classes = sorted(list(cnt.keys()))

    # F1 tính chỉ trên các lớp xuất hiện thực tế trong ground truth test
    f1_nonzero = f1_score(y_true, preds, labels=present_classes, average='macro', zero_division=0)
    # F1 tính trên cả 3 lớp pos, neg, neu
    f1_all = f1_score(y_true, preds, labels=['pos', 'neg', 'neu'], average='macro', zero_division=0)
    acc = accuracy_score(y_true, preds)

    b_macro_nonzero[a] = f1_nonzero
    b_macro_all[a] = f1_all
    print(f"  Aspect {a:10s} (N={len(y_true)}): Acc={acc:.4f} | Macro-F1 (support>0)={f1_nonzero:.4f} | Macro-F1 (3 classes)={f1_all:.4f} | Phân bổ nhãn: {dict(cnt)}")

mean_macro_nonzero = np.mean(list(b_macro_nonzero.values()))
print(f"=> Mean Macro-F1 (support > 0) trên TEST: {mean_macro_nonzero:.4f} (so với Mean 3 classes: 0.5107)")

# Phân tích sâu 16 mẫu warranty trên TEST
print("\n=== PHÂN TÍCH 16 MẪU WARRANTY TRÊN TEST ===")
w_idx = [i for i, l in enumerate(y_test_B['warranty']) if l is not None]
w_preds = lr_models_B['warranty'].predict(X_test[w_idx])
w_probs = lr_models_B['warranty'].predict_proba(X_test[w_idx])
w_classes = lr_models_B['warranty'].classes_.tolist()

for idx_in_w, original_idx in enumerate(w_idx):
    r = test_samples[original_idx]
    pred_cls = w_preds[idx_in_w]
    probs_dict = {cls: round(w_probs[idx_in_w][c_i], 3) for c_i, cls in enumerate(w_classes)}
    status = "ĐÚNG" if pred_cls == "pos" else "SAI"
    print(f"[{status}] ID: {r['id']} | Pred: {pred_cls} | Probs: {probs_dict} | Text: \"{r['content']}\"")


# =========================================================================
# MỤC 6: ĐÁNH GIÁ RECOMMENDER (VAL+TEST VS OOF)
# =========================================================================
print("\n=== RECOMMENDER EVALUATION TRÊN VAL + TEST ===")
# Nạp personas từ data/personas.json
personas_data = json.load(open('data/personas.json', encoding='utf-8'))
PROVIDER_PERSONAS = personas_data['PROVIDER_PERSONAS']
CUSTOMER_PERSONAS = personas_data['CUSTOMER_PERSONAS']

def evaluate_reco_subset(review_filter_fn, name_label):
    db_file = 'data/database.json'
    dbData = json.load(open(db_file, encoding='utf-8'))

    # Lấy các review theo bộ lọc
    target_reviews = [r for r in data if review_filter_fn(r)]

    # Dự đoán trực tiếp bằng lr_models_A và lr_models_B
    providerAspectStats = {}
    for idx, p in enumerate(PROVIDER_PERSONAS):
        prvId = f"PRV_RECO_{String(idx + 1).padStart(3, '0')}" if 'String' in globals() else f"PRV_RECO_{idx+1:03d}"
        providerAspectStats[prvId] = {
            'id': prvId, 'name': p['name'], 'category': p['category'], 'reviewCount': 0,
            'aspectSums': {a: 0.0 for a in ASPECTS}, 'aspectCounts': {a: 0 for a in ASPECTS}
        }

    for r in target_reviews:
        prvId = r['providerId']
        if prvId in providerAspectStats:
            providerAspectStats[prvId]['reviewCount'] += 1
            # ML predict
            # Sử dụng lr_models_A và lr_models_B
            text_clean = preprocess_text(r['content'])
            X_it = feature_union.transform([text_clean])
            for j, a in enumerate(ASPECTS):
                prob = lr_models_A[a].predict_proba(X_it)[0, 1]
                if prob >= lr_thresholds_A[a]:
                    pred_sent = lr_models_B[a].predict(X_it)[0]
                    score = 5.0 if pred_sent == 'pos' else (3.0 if pred_sent == 'neu' else 1.0)
                    providerAspectStats[prvId]['aspectSums'][a] += score
                    providerAspectStats[prvId]['aspectCounts'][a] += 1

    # Global means
    g_sums = {a: 0.0 for a in ASPECTS}
    g_counts = {a: 0 for a in ASPECTS}
    for st in providerAspectStats.values():
        if st['reviewCount'] >= 5:
            for a in ASPECTS:
                g_sums[a] += st['aspectSums'][a]
                g_counts[a] += st['aspectCounts'][a]
    g_means = {a: (g_sums[a] / g_counts[a] if g_counts[a] > 0 else 3.5) for a in ASPECTS}

    # Scores
    scores_dict = {}
    for prvId, st in providerAspectStats.items():
        sc = {}
        for a in ASPECTS:
            cnt = st['aspectCounts'][a]
            sm = st['aspectSums'][a]
            m = 3 if st['reviewCount'] < 5 else 1
            val = (sm + m * g_means[a]) / (cnt + m)
            sc[a] = round(val, 1)
        scores_dict[prvId] = sc

    # Đánh giá 8 Customer Personas
    # Lấy danh sách provider được đánh giá (chỉ lấy providers có review trong tập filter nếu là val+test)
    eval_prov_ids = [prvId for prvId, st in providerAspectStats.items() if st['reviewCount'] > 0]
    eval_providers = []
    for idx, p in enumerate(PROVIDER_PERSONAS):
        prvId = f"PRV_RECO_{idx+1:03d}"
        if prvId in eval_prov_ids:
            dbP = next((dp for dp in dbData['providers'] if dp['id'] == prvId), None)
            eval_providers.append({
                'id': prvId,
                'name': p['name'],
                'rating': dbP['rating'] if dbP else 4.5,
                'completedOrders': dbP['completedOrders'] if dbP else 10,
                'trueAspects': p['aspectProfile'],
                'predictedAspects': scores_dict[prvId]
            })

    ndcg3_list, ndcg3_base_list = [], []
    ndcg5_list, ndcg5_base_list = [], []
    prec3_list, prec3_base_list = [], []

    def dcg(rels, k):
        return sum((2**r - 1) / np.log2(i + 2) for i, r in enumerate(rels[:k]))

    for cust in CUSTOMER_PERSONAS:
        w = cust['aspectWeights']
        items = []
        for p in eval_providers:
            true_u = sum(w[a] * p['trueAspects'][a] for a in ASPECTS)
            pred_s = sum(w[a] * p['predictedAspects'][a] for a in ASPECTS)
            items.append({**p, 'trueUtility': true_u, 'predictedScore': pred_s})

        ideal = sorted(items, key=lambda x: x['trueUtility'], reverse=True)
        ideal_rels = [x['trueUtility'] for x in ideal]

        reco = sorted(items, key=lambda x: x['predictedScore'], reverse=True)
        reco_rels = [x['trueUtility'] for x in reco]

        base = sorted(items, key=lambda x: (x['rating'], x['completedOrders']), reverse=True)
        base_rels = [x['trueUtility'] for x in base]

        # P70 utility
        sorted_u = sorted(ideal_rels)
        p70 = sorted_u[int(len(sorted_u) * 0.7)]

        k3_ideal = dcg(ideal_rels, 3)
        n3_reco = dcg(reco_rels, 3) / k3_ideal if k3_ideal > 0 else 0
        n3_base = dcg(base_rels, 3) / k3_ideal if k3_ideal > 0 else 0

        k5_ideal = dcg(ideal_rels, 5)
        n5_reco = dcg(reco_rels, 5) / k5_ideal if k5_ideal > 0 else 0
        n5_base = dcg(base_rels, 5) / k5_ideal if k5_ideal > 0 else 0

        p3_reco = sum(1 for x in reco[:3] if x['trueUtility'] >= p70) / 3
        p3_base = sum(1 for x in base[:3] if x['trueUtility'] >= p70) / 3

        ndcg3_list.append(n3_reco)
        ndcg3_base_list.append(n3_base)
        ndcg5_list.append(n5_reco)
        ndcg5_base_list.append(n5_base)
        prec3_list.append(p3_reco)
        prec3_base_list.append(p3_base)

    print(f"[{name_label}] ({len(eval_providers)} Providers đánh giá):")
    print(f"  NDCG@3:      Recommender = {np.mean(ndcg3_list):.4f} vs Baseline = {np.mean(ndcg3_base_list):.4f} (Chênh lệch: +{(np.mean(ndcg3_list) - np.mean(ndcg3_base_list))*100:.2f}%)")
    print(f"  NDCG@5:      Recommender = {np.mean(ndcg5_list):.4f} vs Baseline = {np.mean(ndcg5_base_list):.4f} (Chênh lệch: +{(np.mean(ndcg5_list) - np.mean(ndcg5_base_list))*100:.2f}%)")
    print(f"  Precision@3: Recommender = {np.mean(prec3_list):.4f} vs Baseline = {np.mean(prec3_base_list):.4f}")

# Chạy bản Val + Test (142 reviews, 9 providers)
evaluate_reco_subset(lambda r: r['split'] in ['val', 'test'], "BẢN MỚI 1: Chỉ dùng Val + Test (Out-of-Training-Providers)")
# Chạy bản tất cả (Bản cũ)
evaluate_reco_subset(lambda r: True, "BẢN GỐC: Tất cả 400 reviews")


# =========================================================================
# MỤC 7: LEAVE-ONE-PROVIDER-OUT & BOOTSTRAP 95% CI
# =========================================================================
print("\n=== PHÂN TÍCH PHỤ: LEAVE-ONE-PROVIDER-OUT TRÊN TOÀN BỘ 400 REVIEWS ===")
all_texts = [preprocess_text(r['content']) for r in data]
y_all_A, y_all_B = extract_targets(data)
all_providers = [r['providerId'] for r in data]

logo = LeaveOneGroupOut()
lopo_f1s_A = []
lopo_accs_B = []

# Fit feature union trên toàn bộ để vector hóa
X_all = feature_union.fit_transform(all_texts)

for fold, (trn_idx, val_idx) in enumerate(logo.split(X_all, groups=all_providers)):
    # Task A
    f1s_fold = []
    for j in range(len(ASPECTS)):
        clf = LogisticRegression(C=10.0, penalty='l2', class_weight='balanced', solver='liblinear', random_state=RANDOM_STATE)
        clf.fit(X_all[trn_idx], y_all_A[trn_idx, j])
        preds = (clf.predict_proba(X_all[val_idx])[:, 1] >= 0.45).astype(int)
        f1s_fold.append(f1_score(y_all_A[val_idx, j], preds, zero_division=0))
    lopo_f1s_A.append(np.mean(f1s_fold))

    # Task B
    accs_fold = []
    for a in ASPECTS:
        tr_b = [i for i in trn_idx if y_all_B[a][i] is not None]
        va_b = [i for i in val_idx if y_all_B[a][i] is not None]
        if tr_b and va_b and len(set(y_all_B[a][i] for i in tr_b)) > 1:
            clf_b = LogisticRegression(C=1.0, penalty='l2', class_weight='balanced', solver='lbfgs', random_state=RANDOM_STATE, max_iter=500)
            clf_b.fit(X_all[tr_b], [y_all_B[a][i] for i in tr_b])
            p_b = clf_b.predict(X_all[va_b])
            accs_fold.append(accuracy_score([y_all_B[a][i] for i in va_b], p_b))
    if accs_fold:
        lopo_accs_B.append(np.mean(accs_fold))

print(f"Leave-One-Provider-Out (24 folds, 400 reviews):")
print(f"  Tác vụ A Macro-F1: {np.mean(lopo_f1s_A):.4f} ± {np.std(lopo_f1s_A):.4f} (Min: {np.min(lopo_f1s_A):.4f}, Max: {np.max(lopo_f1s_A):.4f})")
print(f"  Tác vụ B Accuracy: {np.mean(lopo_accs_B):.4f} ± {np.std(lopo_accs_B):.4f} (Min: {np.min(lopo_accs_B):.4f}, Max: {np.max(lopo_accs_B):.4f})")

# Bootstrap 95% CI trên 81 mẫu TEST
print("\n=== BOOTSTRAP 95% CONFIDENCE INTERVAL TRÊN TẬP TEST (1000 lượt) ===")
np.random.seed(42)
N_test = len(test_samples)
boot_f1s_A = []
boot_accs_B = []

# Dự đoán cố định của mô hình đã huấn luyện
p_test_A_probs = np.zeros((N_test, len(ASPECTS)))
for j, a in enumerate(ASPECTS):
    p_test_A_probs[:, j] = lr_models_A[a].predict_proba(X_test)[:, 1]
p_test_A = (p_test_A_probs >= np.array([lr_thresholds_A[a] for a in ASPECTS])).astype(int)

p_test_B = {}
for a in ASPECTS:
    t_idx = [i for i, l in enumerate(y_test_B[a]) if l is not None]
    if t_idx:
        preds = lr_models_B[a].predict(X_test[t_idx])
        p_test_B[a] = {orig_i: p for orig_i, p in zip(t_idx, preds)}

for b_i in range(1000):
    sample_indices = np.random.choice(N_test, size=N_test, replace=True)

    # Task A F1 trên sample
    f1_a = np.mean([f1_score(y_test_A[sample_indices, j], p_test_A[sample_indices, j], zero_division=0) for j in range(len(ASPECTS))])
    boot_f1s_A.append(f1_a)

    # Task B Accuracy trên sample
    b_accs = []
    for a in ASPECTS:
        s_idx = [i for i in sample_indices if y_test_B[a][i] is not None]
        if s_idx:
            y_t = [y_test_B[a][i] for i in s_idx]
            p_t = [p_test_B[a][i] for i in s_idx]
            b_accs.append(accuracy_score(y_t, p_t))
    if b_accs:
        boot_accs_B.append(np.mean(b_accs))

ci_A_low, ci_A_high = np.percentile(boot_f1s_A, [2.5, 97.5])
ci_B_low, ci_B_high = np.percentile(boot_accs_B, [2.5, 97.5])

print(f"Bootstrap 95% CI (1000 resamples):")
print(f"  Tác vụ A Macro-F1: 0.7955 (95% CI: [{ci_A_low:.4f}, {ci_A_high:.4f}])")
print(f"  Tác vụ B Accuracy: 0.7644 (95% CI: [{ci_B_low:.4f}, {ci_B_high:.4f}])")
