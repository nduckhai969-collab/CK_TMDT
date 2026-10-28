"""
ml/preprocess.py
Xử lý văn bản tiếng Việt cho mô hình Aspect-based Sentiment Analysis.
Quy tắc:
1. Unicode NFC normalization
2. Lowercase
3. Rút gọn ký tự lặp ("chuẩnnn" -> "chuẩn", "quáaa" -> "quá")
4. Map teencode (ko, k, đc, mk, lun, vs, ng, cx, mn, kp, r, quớ, ...)
5. Giữ nguyên từ phủ định (không, chẳng, chưa, hơi, chả, đâu, ...)
6. Tạo thêm bản không dấu ghép vào chuỗi để xử lý review không dấu
"""

import re
import unicodedata

TEENCODE_DICT = {
    'ko': 'không',
    'k': 'không',
    'kh': 'không',
    'khg': 'không',
    'hok': 'không',
    'hem': 'không',
    'hổng': 'không',
    'chớ': 'chớ',
    'đc': 'được',
    'dc': 'được',
    'mk': 'mình',
    'lun': 'luôn',
    'luon': 'luôn',
    'ng': 'người',
    'vs': 'với',
    'cx': 'cũng',
    'mn': 'mọi người',
    'kp': 'không phải',
    'r': 'rồi',
    'rùi': 'rồi',
    'quớ': 'quá',
    'wa': 'quá',
    'qúa': 'quá',
    'oke': 'tốt',
    'oki': 'tốt',
    'okey': 'tốt',
    'ok': 'tốt',
    'thik': 'thích',
    'thjk': 'thích',
    'chug': 'chung',
    'bh': 'bảo hành',
    'sp': 'sản phẩm',
    'dv': 'dịch vụ',
    'nv': 'nhân viên',
    'tks': 'cảm ơn',
    'thank': 'cảm ơn',
    'thanks': 'cảm ơn',
    'a/c': 'anh chị',
    'ac': 'anh chị',
    'ib': 'nhắn tin',
    'inbox': 'nhắn tin',
    'rep': 'trả lời'
}

# Regex khử ký tự lặp >= 3 lần (ví dụ: chuẩnnn -> chuẩn, tốttt -> tốt, quáaa -> quá)
RE_REPEATED = re.compile(r'([a-zA-Z\u00C0-\u1EF9])\1{2,}', re.IGNORECASE)

# Chuyển tiếng Việt có dấu sang không dấu
def remove_accents(text: str) -> str:
    nfd = unicodedata.normalize('NFD', text)
    no_mark = re.sub(r'[\u0300-\u036f]', '', nfd)
    no_mark = no_mark.replace('đ', 'd').replace('Đ', 'D')
    return unicodedata.normalize('NFC', no_mark)

def normalize_text_base(text: str) -> str:
    if not text:
        return ""
    
    # 1. Unicode NFC
    text = unicodedata.normalize('NFC', text)
    
    # 2. Lowercase
    text = text.lower()
    
    # 3. Rút gọn ký tự lặp
    text = RE_REPEATED.sub(r'\1', text)
    
    # 4. Map teencode (theo từ phân cách bởi ranh giới từ hoặc ký tự đặc biệt)
    tokens = re.split(r'(\s+|[^\w\s])', text)
    mapped_tokens = []
    for tok in tokens:
        clean_tok = tok.strip()
        if clean_tok in TEENCODE_DICT:
            mapped_tokens.append(TEENCODE_DICT[clean_tok])
        else:
            mapped_tokens.append(tok)
    text = ''.join(mapped_tokens)
    
    # Chuẩn hóa khoảng trắng
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def preprocess_text(text: str, include_unaccented: bool = True) -> str:
    """
    Hàm tiền xử lý duy nhất dùng chung cho cả huấn luyện và suy luận.
    Nếu include_unaccented=True, gắn thêm bản không dấu vào đuôi chuỗi
    để các đặc trưng n-gram của review không dấu khớp trực tiếp với đặc trưng từ vựng.
    """
    base = normalize_text_base(text)
    if not base:
        return ""
    if include_unaccented:
        unacc = remove_accents(base)
        return f"{base} {unacc}"
    return base

if __name__ == '__main__':
    samples = [
        "Kính gửi sàn SkillRental, sửa chữa dứt điểm không bị lại, được cái giao tiếp đúng mực không quá nhiệt tình.",
        "mk vừa hoàn thành đơn hàng, chi phí quá êm ví, và làm rất kỹ và tỉ mỉ. 😊",
        "Thực sự thì, giá cao ngất ngưởng, mặc dù vậy chuẩnnn chỉ về mặt thời gian. 😡",
        "qua chat vi xot ca ruot, duoc cai giao tiep dung muc khong qua nhiet tinh.",
        "dịch vụ ko tốt tí nào, giá đắt dã mannn lun!",
        "ko sợ trễ giờ, làm siêu nhanh"
    ]
    for s in samples:
        print("GỐC:", s)
        print("XỬ LÝ:", preprocess_text(s))
        print("-" * 50)
