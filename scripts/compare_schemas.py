#!/usr/bin/env python3
"""
Compare two pg_dump --schema-only outputs (dev vs prod) and produce a
structured human-readable diff report.

Usage:
    python compare_schemas.py <dev_schema.sql> <prod_schema.sql> <out_report.md>
"""
import re
import sys
from pathlib import Path
from collections import OrderedDict


def read_sql(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def extract_create_tables(sql: str) -> "OrderedDict[str, str]":
    """Return {table_name: full CREATE TABLE block including columns}."""
    tables = OrderedDict()
    pattern = re.compile(
        r'CREATE TABLE IF NOT EXISTS "public"\."([^"]+)"\s*\((.*?)\n\);',
        re.DOTALL,
    )
    for m in pattern.finditer(sql):
        tables[m.group(1)] = m.group(2)
    return tables


def parse_columns(table_body: str) -> "OrderedDict[str, str]":
    """Parse column definitions from a CREATE TABLE body.
    Returns {col_name: full_definition_string}.
    Constraint-only lines (CONSTRAINT, PRIMARY KEY, etc.) are skipped.
    """
    cols = OrderedDict()
    # Split by commas not inside parentheses
    depth = 0
    buf = []
    parts = []
    for ch in table_body:
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())

    skip_keywords = ("CONSTRAINT ", "PRIMARY KEY", "UNIQUE ", "FOREIGN KEY", "CHECK ")
    for raw in parts:
        line = raw.strip().rstrip(",")
        if not line:
            continue
        if any(line.upper().startswith(k) for k in skip_keywords):
            continue
        m = re.match(r'"([^"]+)"\s+(.+)', line, re.DOTALL)
        if m:
            cols[m.group(1)] = " ".join(m.group(2).split())
    return cols


def extract_enums(sql: str) -> "OrderedDict[str, list]":
    out = OrderedDict()
    pattern = re.compile(
        r'CREATE TYPE "public"\."([^"]+)" AS ENUM \((.*?)\);',
        re.DOTALL,
    )
    for m in pattern.finditer(sql):
        values = re.findall(r"'([^']+)'", m.group(2))
        out[m.group(1)] = values
    return out


def extract_functions(sql: str) -> "OrderedDict[str, str]":
    """Extract function bodies; key by function signature, value by full body."""
    out = OrderedDict()
    pattern = re.compile(
        r'CREATE (?:OR REPLACE )?FUNCTION "public"\."([^"]+)"\(([^)]*)\)(.*?)\$\$;',
        re.DOTALL,
    )
    for m in pattern.finditer(sql):
        sig = f"{m.group(1)}({m.group(2).strip()})"
        out[sig] = m.group(0)
    return out


def extract_named_objects(sql: str, prefix_regex: str) -> "OrderedDict[str, str]":
    out = OrderedDict()
    for m in re.finditer(prefix_regex, sql):
        out[m.group(1)] = m.group(0)
    return out


def diff_dicts(dev: dict, prod: dict):
    only_dev = [k for k in dev if k not in prod]
    only_prod = [k for k in prod if k not in dev]
    common_changed = [k for k in dev if k in prod and dev[k] != prod[k]]
    return only_dev, only_prod, common_changed


def main():
    if len(sys.argv) != 4:
        print("Usage: compare_schemas.py <dev.sql> <prod.sql> <out.md>")
        sys.exit(1)
    dev_path, prod_path, out_path = sys.argv[1:4]
    dev = read_sql(dev_path)
    prod = read_sql(prod_path)

    dev_tables = extract_create_tables(dev)
    prod_tables = extract_create_tables(prod)
    dev_enums = extract_enums(dev)
    prod_enums = extract_enums(prod)
    dev_funcs = extract_functions(dev)
    prod_funcs = extract_functions(prod)

    # Policies / Triggers / Indexes are line-grep-able
    pol_re = r'CREATE POLICY "([^"]+)" ON [^;]+;'
    trg_re = r'CREATE (?:OR REPLACE )?TRIGGER "([^"]+)"[^;]+;'
    idx_re = r'CREATE (?:UNIQUE )?INDEX "([^"]+)"[^;]+;'

    dev_pol = extract_named_objects(dev, pol_re)
    prod_pol = extract_named_objects(prod, pol_re)
    dev_trg = extract_named_objects(dev, trg_re)
    prod_trg = extract_named_objects(prod, trg_re)
    dev_idx = extract_named_objects(dev, idx_re)
    prod_idx = extract_named_objects(prod, idx_re)

    lines = []
    a = lines.append

    a("# Dev → Prod Schema Karşılaştırma Raporu")
    a("")
    a(f"- **Dev dosyası:** `{dev_path}`")
    a(f"- **Prod dosyası:** `{prod_path}`")
    a("")
    a("> Bu rapor `pg_dump --schema-only` çıktıları karşılaştırılarak otomatik üretilmiştir.")
    a("> İki ortam arasındaki **şema farklılıklarını** gösterir, **veri farkı** içermez.")
    a("")

    # === SUMMARY ===
    a("## 📊 Özet")
    a("")
    a("| Kategori | Sadece DEV'de | Sadece PROD'da | İki tarafta farklı |")
    a("|---|---|---|---|")
    new_t, drop_t, chg_t = diff_dicts(dev_tables, prod_tables)
    new_e, drop_e, chg_e = diff_dicts(dev_enums, prod_enums)
    new_f, drop_f, chg_f = diff_dicts(dev_funcs, prod_funcs)
    new_p, drop_p, chg_p = diff_dicts(dev_pol, prod_pol)
    new_tr, drop_tr, chg_tr = diff_dicts(dev_trg, prod_trg)
    new_i, drop_i, chg_i = diff_dicts(dev_idx, prod_idx)
    a(f"| Tablolar | {len(new_t)} | {len(drop_t)} | {len(chg_t)} |")
    a(f"| Enum types | {len(new_e)} | {len(drop_e)} | {len(chg_e)} |")
    a(f"| Functions | {len(new_f)} | {len(drop_f)} | {len(chg_f)} |")
    a(f"| Policies | {len(new_p)} | {len(drop_p)} | {len(chg_p)} |")
    a(f"| Triggers | {len(new_tr)} | {len(drop_tr)} | {len(chg_tr)} |")
    a(f"| Indexes | {len(new_i)} | {len(drop_i)} | {len(chg_i)} |")
    a("")

    # === NEW TABLES ===
    a("## 🆕 Yeni Tablolar (DEV'de var, PROD'da yok)")
    a("")
    if not new_t:
        a("_(yok)_")
    else:
        for t in new_t:
            cols = parse_columns(dev_tables[t])
            a(f"### `{t}`")
            a(f"**Kolonlar ({len(cols)}):**")
            a("")
            a("| Kolon | Tipi |")
            a("|---|---|")
            for c, d in cols.items():
                a(f"| `{c}` | `{d}` |")
            a("")
    a("")

    # === DROPPED TABLES ===
    a("## 🗑️ PROD'da olup DEV'de olmayan tablolar")
    a("")
    if not drop_t:
        a("_(yok — hiçbir prod tablosu silinmemiş, ✅ güvenli)_")
    else:
        a("⚠️ Bu tabloları senkronizasyonda **silmek istemiyorsan** elle muaf tut.")
        for t in drop_t:
            a(f"- `{t}`")
    a("")

    # === COLUMN CHANGES IN COMMON TABLES ===
    a("## ✏️ Mevcut Tablolarda Kolon Değişiklikleri")
    a("")
    any_change = False
    for t in dev_tables:
        if t not in prod_tables:
            continue
        dev_cols = parse_columns(dev_tables[t])
        prod_cols = parse_columns(prod_tables[t])
        added = [c for c in dev_cols if c not in prod_cols]
        removed = [c for c in prod_cols if c not in dev_cols]
        modified = [c for c in dev_cols if c in prod_cols and dev_cols[c] != prod_cols[c]]
        if not (added or removed or modified):
            continue
        any_change = True
        a(f"### `{t}`")
        if added:
            a("**➕ Eklenen kolonlar:**")
            a("")
            a("| Kolon | Tipi |")
            a("|---|---|")
            for c in added:
                a(f"| `{c}` | `{dev_cols[c]}` |")
            a("")
        if removed:
            a("**➖ Kaldırılan kolonlar (PROD'da var, DEV'de yok):** ⚠️")
            a("")
            a("| Kolon | Eski tipi |")
            a("|---|---|")
            for c in removed:
                a(f"| `{c}` | `{prod_cols[c]}` |")
            a("")
        if modified:
            a("**🔄 Değişen kolonlar:**")
            a("")
            a("| Kolon | DEV | PROD |")
            a("|---|---|---|")
            for c in modified:
                a(f"| `{c}` | `{dev_cols[c]}` | `{prod_cols[c]}` |")
            a("")
    if not any_change:
        a("_(mevcut tablolarda kolon değişikliği yok)_")
    a("")

    # === ENUMS ===
    a("## 🧩 Enum Type Değişiklikleri")
    a("")
    if new_e:
        a("**🆕 Yeni enum'lar:**")
        a("")
        for n in new_e:
            a(f"- `{n}` → değerler: {dev_enums[n]}")
        a("")
    if drop_e:
        a("**🗑️ PROD'dan silinmesi gereken enum'lar:** ⚠️")
        for n in drop_e:
            a(f"- `{n}`")
        a("")
    if chg_e:
        a("**🔄 Değişen enum'lar:**")
        a("")
        for n in chg_e:
            d_set = set(dev_enums[n])
            p_set = set(prod_enums[n])
            added = sorted(d_set - p_set)
            removed = sorted(p_set - d_set)
            a(f"- `{n}`:")
            if added:
                a(f"  - Eklenen değerler: {added}")
            if removed:
                a(f"  - Kaldırılan değerler: {removed} ⚠️")
        a("")
    if not (new_e or drop_e or chg_e):
        a("_(enum değişikliği yok)_")
    a("")

    # === FUNCTIONS ===
    a("## ⚙️ Function Değişiklikleri")
    a("")
    if new_f:
        a("**🆕 Yeni functionlar:**")
        for n in new_f:
            a(f"- `{n}`")
        a("")
    if drop_f:
        a("**🗑️ PROD'dan silinmesi gereken functionlar:**")
        for n in drop_f:
            a(f"- `{n}`")
        a("")
    if chg_f:
        a("**🔄 Body'si değişen functionlar:**")
        for n in chg_f:
            a(f"- `{n}`")
        a("")
    if not (new_f or drop_f or chg_f):
        a("_(function değişikliği yok)_")
    a("")

    # === POLICIES ===
    a("## 🔐 RLS Policy Değişiklikleri")
    a("")
    if new_p:
        a(f"**🆕 Yeni policy'ler ({len(new_p)}):**")
        for n in new_p:
            a(f"- `{n}`")
        a("")
    if drop_p:
        a(f"**🗑️ PROD'da olup DEV'de olmayan policy'ler ({len(drop_p)}):** ⚠️")
        for n in drop_p:
            a(f"- `{n}`")
        a("")
    if chg_p:
        a(f"**🔄 Tanımı değişen policy'ler ({len(chg_p)}):**")
        for n in chg_p:
            a(f"- `{n}`")
        a("")
    if not (new_p or drop_p or chg_p):
        a("_(policy değişikliği yok)_")
    a("")

    # === TRIGGERS ===
    a("## 🔔 Trigger Değişiklikleri")
    a("")
    if new_tr:
        a("**🆕 Yeni trigger'lar:**")
        for n in new_tr:
            a(f"- `{n}`")
        a("")
    if drop_tr:
        a("**🗑️ PROD'da olup DEV'de olmayan trigger'lar:**")
        for n in drop_tr:
            a(f"- `{n}`")
        a("")
    if chg_tr:
        a("**🔄 Tanımı değişen trigger'lar:**")
        for n in chg_tr:
            a(f"- `{n}`")
        a("")
    if not (new_tr or drop_tr or chg_tr):
        a("_(trigger değişikliği yok)_")
    a("")

    # === INDEXES ===
    a("## 🔑 Index Değişiklikleri")
    a("")
    if new_i:
        a(f"**🆕 Yeni indexler ({len(new_i)}):**")
        for n in new_i:
            a(f"- `{n}`")
        a("")
    if drop_i:
        a(f"**🗑️ PROD'da olup DEV'de olmayan indexler ({len(drop_i)}):**")
        for n in drop_i:
            a(f"- `{n}`")
        a("")
    if chg_i:
        a(f"**🔄 Tanımı değişen indexler ({len(chg_i)}):**")
        for n in chg_i:
            a(f"- `{n}`")
        a("")
    if not (new_i or drop_i or chg_i):
        a("_(index değişikliği yok)_")
    a("")

    Path(out_path).write_text("\n".join(lines), encoding="utf-8")
    print(f"✅ Rapor yazıldı: {out_path}")
    print(f"   - {len(new_t)} yeni tablo, {len(new_e)} yeni enum, {len(new_f)} yeni function")
    print(f"   - {len(new_p)} yeni policy, {len(new_tr)} yeni trigger, {len(new_i)} yeni index")


if __name__ == "__main__":
    main()
