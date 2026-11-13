#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/prepareAnnotatorB.py

Trích xuất ngẫu nhiên tập mẫu con (tối thiểu 30%, seed 42) từ annotator_A.csv để chuyển giao cho
người gán nhãn độc lập B (Annotator B). Đảm bảo:
- Loại bỏ hoàn toàn các nhãn của Annotator A (để trống).
- Đảm bảo mỗi người viết (writer) đều có đại diện ít nhất 1 câu (nếu có thể).
- Bỏ qua các dòng ví dụ bắt đầu bằng "EXAMPLE_".
- Tự động nhận diện định dạng chuẩn CSV lẫn dữ liệu dán theo khối 8 dòng từ spreadsheet.
"""

import os
import sys
import csv
import math
import random
import argparse

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def load_annotator_a_records(input_path):
    if not os.path.exists(input_path):
        return []

    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Thử đọc dạng chuẩn DictReader
    rows = []
    lines = [l.strip() for l in content.splitlines() if l.strip()]
    if not lines:
        return []

    # Kiểm tra xem có phải dán theo khối 8 dòng (không có dấu phẩy ở các dòng dữ liệu)
    # Nếu dòng thứ 2 hoặc 3 không có dấu phẩy nhưng bắt đầu như ID
    is_vertical_block = False
    if len(lines) > 8:
        commas_in_lines = sum(1 for l in lines[1:9] if "," in l)
        if commas_in_lines <= 2 and (len(lines) - 4) % 8 == 0:
            is_vertical_block = True

    if is_vertical_block:
        # Xử lý tự động cứu dữ liệu dạng dán dọc
        # Bỏ header và 3 dòng ví dụ nếu có
        start_idx = 0
        for idx, l in enumerate(lines):
            if l.startswith("DEMO_") or (idx > 3 and not l.startswith("EXAMPLE_") and not "," in l):
                start_idx = idx
                break
        block_lines = lines[start_idx:]
        for i in range(0, len(block_lines), 8):
            chunk = block_lines[i:i+8]
            if len(chunk) == 8:
                rows.append({
                    "id": chunk[0].strip(),
                    "writer": chunk[1].strip(),
                    "text": chunk[2].strip(),
                    "quality": chunk[3].strip(),
                    "price": chunk[4].strip(),
                    "speed": chunk[5].strip(),
                    "attitude": chunk[6].strip(),
                    "warranty": chunk[7].strip()
                })
        return rows

    # Đọc bình thường với csv.DictReader
    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            cid = (r.get("id") or "").strip()
            if not cid:
                continue
            rows.append({
                "id": cid,
                "writer": (r.get("writer") or "unknown").strip(),
                "text": (r.get("text") or "").strip(),
                "quality": (r.get("quality") or "-").strip(),
                "price": (r.get("price") or "-").strip(),
                "speed": (r.get("speed") or "-").strip(),
                "attitude": (r.get("attitude") or "-").strip(),
                "warranty": (r.get("warranty") or "-").strip()
            })
    return rows

def prepare_annotator_b(input_path, output_path, seed=42, min_ratio=0.30):
    all_rows = load_annotator_a_records(input_path)

    # Lọc bỏ các dòng mẫu ví dụ EXAMPLE_
    valid_rows = [r for r in all_rows if not r["id"].startswith("EXAMPLE_") and r["text"]]

    if not valid_rows:
        print(f"[INFO] File {input_path} chưa có dữ liệu thật (chỉ có dòng EXAMPLE_ hoặc rỗng).")
        print("Không tạo file annotator_B.csv khi chưa có câu đánh giá thật từ người viết.")
        return False

    total_count = len(valid_rows)
    target_count = max(1, math.ceil(total_count * min_ratio))

    random.seed(seed)

    # Gom nhóm theo writer
    by_writer = {}
    for idx, row in enumerate(valid_rows):
        w = row.get("writer") or "unknown"
        if w not in by_writer:
            by_writer[w] = []
        by_writer[w].append((idx, row))

    selected_indices = set()

    # 1. Ưu tiên mỗi writer có ít nhất 1 câu
    writers = sorted(list(by_writer.keys()))
    for w in writers:
        rows_w = by_writer[w]
        chosen = random.choice(rows_w)
        selected_indices.add(chosen[0])

    # 2. Nếu số lượng chọn chưa đạt target_count, lấy thêm ngẫu nhiên từ phần còn lại
    remaining_indices = [i for i in range(total_count) if i not in selected_indices]
    random.shuffle(remaining_indices)

    needed = target_count - len(selected_indices)
    if needed > 0:
        for idx in remaining_indices[:needed]:
            selected_indices.add(idx)

    # Sắp xếp lại theo thứ tự ban đầu
    final_indices = sorted(list(selected_indices))
    selected_rows = [valid_rows[i] for i in final_indices]

    # Xuất ra file annotator_B.csv với nhãn bị XÓA HOÀN TOÀN
    fieldnames = ["id", "text", "quality", "price", "speed", "attitude", "warranty"]
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in selected_rows:
            writer.writerow({
                "id": r["id"],
                "text": r["text"],
                "quality": "",
                "price": "",
                "speed": "",
                "attitude": "",
                "warranty": ""
            })

    print(f"[SUCCESS] Đã sinh {output_path} thành công:")
    print(f"  - Tổng số câu thật từ A: {total_count}")
    print(f"  - Số câu trích cho B: {len(selected_rows)} ({len(selected_rows)/total_count*100:.1f}%)")
    print(f"  - Số người viết (writers) được bao phủ: {len(writers)}/{len(writers)}")
    print(f"  - Tất cả nhãn của A đã được XÓA HOÀN TOÀN để đảm bảo gán nhãn mù độc lập.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chuẩn bị file gán nhãn mù cho Annotator B")
    parser.add_argument("--input", default="data/handwritten/annotator_A.csv", help="Đường dẫn file annotator_A.csv")
    parser.add_argument("--output", default="data/handwritten/annotator_B.csv", help="Đường dẫn file annotator_B.csv xuất ra")
    parser.add_argument("--seed", type=int, default=42, help="Seed ngẫu nhiên (mặc định 42)")
    parser.add_argument("--ratio", type=float, default=0.30, help="Tỷ lệ lấy mẫu tối thiểu (mặc định 0.30)")

    args = parser.parse_args()
    prepare_annotator_b(args.input, args.output, args.seed, args.ratio)
