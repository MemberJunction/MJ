/**
 * Embedded Python sandbox harness and pure-Python `pandas` / `numpy` compatibility layer.
 *
 * When native `pandas` and `numpy` are installed in the Python environment, they are used directly.
 * When running on a minimal `python3` installation without C-extension wheels, the built-in
 * `_MiniPandas` (`pd`) and `_MiniNumpy` (`np`) modules are registered in `sys.modules['pandas']`
 * and `sys.modules['numpy']` so standard LLM data-analysis scripts (`pd.read_csv`, `df[mask]`,
 * `df.groupby(...).agg(...)`, `pd.to_numeric`, `.str.*`, `.dt.*`, etc.) execute identically.
 *
 * Security is enforced at the CPython C-runtime level via PEP 578 `sys.addaudithook`.
 *
 * @module @memberjunction/code-execution
 */

export const PYTHON_SANDBOX_HARNESS_SOURCE = String.raw`
import sys
import os
import io
import csv
import json
import math
import re
import statistics
import datetime
import decimal
import fractions
import collections
import itertools
import functools
import traceback

try:
    import resource
except ImportError:
    resource = None

# ---------------------------------------------------------------------------
# Pure-Python numpy & pandas compatibility fallback (used when C wheels absent)
# ---------------------------------------------------------------------------

def _is_na(v):
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and v.strip() in ('', 'NA', 'N/A', 'NaN', 'nan', 'null', 'NULL', 'None', '#N/A'):
        return True
    return False

def _try_parse_number(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return None if (isinstance(v, float) and math.isnan(v)) else v
    if isinstance(v, str):
        s = v.strip()
        if not s or _is_na(s):
            return None
        cleaned = re.sub(r'^[\$\€\£\¥\s]+|[\s%]+$', '', s).replace(',', '')
        if cleaned.startswith('(') and cleaned.endswith(')'):
            cleaned = '-' + cleaned[1:-1]
        try:
            if '.' not in cleaned and 'e' not in cleaned.lower():
                return int(cleaned)
            return float(cleaned)
        except ValueError:
            return None
    return None

def _try_parse_datetime(v, fmt=None):
    if v is None or _is_na(v):
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return datetime.datetime(v.year, v.month, v.day) if type(v) is datetime.date else v
    if not isinstance(v, str):
        v = str(v)
    s = v.strip()
    if not s:
        return None
    if fmt:
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            return None
    try:
        return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        pass
    for candidate in (
        '%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y', '%d/%m/%Y',
        '%Y/%m/%d', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S',
        '%b %d, %Y', '%B %d, %Y', '%d-%b-%Y', '%Y'
    ):
        try:
            return datetime.datetime.strptime(s, candidate)
        except ValueError:
            continue
    return None

class _StringMethods:
    def __init__(self, series):
        self._s = series

    def _map_str(self, fn):
        return _Series(
            [None if _is_na(x) else fn(str(x)) for x in self._s._data],
            name=self._s.name,
            index=list(self._s._index)
        )

    def strip(self, chars=None):
        return self._map_str(lambda s: s.strip(chars))

    def lstrip(self, chars=None):
        return self._map_str(lambda s: s.lstrip(chars))

    def rstrip(self, chars=None):
        return self._map_str(lambda s: s.rstrip(chars))

    def lower(self):
        return self._map_str(lambda s: s.lower())

    def upper(self):
        return self._map_str(lambda s: s.upper())

    def title(self):
        return self._map_str(lambda s: s.title())

    def replace(self, pat, repl, regex=True, case=True):
        def _r(s):
            if regex:
                flags = 0 if case else re.IGNORECASE
                return re.sub(pat, repl, s, flags=flags)
            if not case:
                return re.sub(re.escape(pat), repl, s, flags=re.IGNORECASE)
            return s.replace(pat, repl)
        return self._map_str(_r)

    def contains(self, pat, case=True, na=False, regex=True):
        out = []
        flags = 0 if case else re.IGNORECASE
        for x in self._s._data:
            if _is_na(x):
                out.append(na)
            else:
                s = str(x)
                if regex:
                    out.append(bool(re.search(pat, s, flags=flags)))
                else:
                    out.append((pat in s) if case else (pat.lower() in s.lower()))
        return _Series(out, name=self._s.name, index=list(self._s._index))

    def startswith(self, pat, na=False):
        return _Series(
            [na if _is_na(x) else str(x).startswith(pat) for x in self._s._data],
            name=self._s.name,
            index=list(self._s._index)
        )

    def endswith(self, pat, na=False):
        return _Series(
            [na if _is_na(x) else str(x).endswith(pat) for x in self._s._data],
            name=self._s.name,
            index=list(self._s._index)
        )

    def len(self):
        return _Series(
            [None if _is_na(x) else len(str(x)) for x in self._s._data],
            name=self._s.name,
            index=list(self._s._index)
        )

    def slice(self, start=None, stop=None, step=None):
        return self._map_str(lambda s: s[slice(start, stop, step)])

    def split(self, pat=None, n=-1):
        return self._map_str(lambda s: s.split(pat, n) if n >= 0 else s.split(pat))

    def extract(self, pat, flags=0):
        out = []
        for x in self._s._data:
            if _is_na(x):
                out.append(None)
            else:
                m = re.search(pat, str(x), flags=flags)
                out.append(m.group(1) if (m and m.lastindex) else (m.group(0) if m else None))
        return _Series(out, name=self._s.name, index=list(self._s._index))

class _DateTimeMethods:
    def __init__(self, series):
        self._s = series

    def _map_dt(self, fn):
        out = []
        for x in self._s._data:
            dt = _try_parse_datetime(x)
            out.append(None if dt is None else fn(dt))
        return _Series(out, name=self._s.name, index=list(self._s._index))

    @property
    def year(self):
        return self._map_dt(lambda d: d.year)

    @property
    def month(self):
        return self._map_dt(lambda d: d.month)

    @property
    def day(self):
        return self._map_dt(lambda d: d.day)

    @property
    def quarter(self):
        return self._map_dt(lambda d: (d.month - 1) // 3 + 1)

    @property
    def dayofweek(self):
        return self._map_dt(lambda d: d.weekday())

    @property
    def date(self):
        return self._map_dt(lambda d: d.date().isoformat())

    def strftime(self, fmt):
        return self._map_dt(lambda d: d.strftime(fmt))

class _SeriesILoc:
    def __init__(self, s):
        self._s = s
    def __getitem__(self, idx):
        if isinstance(idx, slice):
            return _Series(self._s._data[idx], name=self._s.name, index=self._s._index[idx])
        if isinstance(idx, list):
            return _Series([self._s._data[i] for i in idx], name=self._s.name, index=[self._s._index[i] for i in idx])
        return self._s._data[idx]

class _SeriesLoc:
    def __init__(self, s):
        self._s = s
    def __getitem__(self, key):
        if isinstance(key, _Series):
            key = key._data
        if isinstance(key, list) and all(isinstance(b, bool) for b in key):
            return _Series(
                [v for v, b in zip(self._s._data, key) if b],
                name=self._s.name,
                index=[i for i, b in zip(self._s._index, key) if b]
            )
        for i, idx_val in enumerate(self._s._index):
            if idx_val == key:
                return self._s._data[i]
        raise KeyError(key)

class _Series:
    def __init__(self, data=None, name=None, index=None, dtype=None):
        if isinstance(data, _Series):
            self._data = list(data._data)
            self._index = list(index) if index is not None else list(data._index)
            self.name = name if name is not None else data.name
        elif isinstance(data, dict):
            self._index = list(data.keys()) if index is None else list(index)
            self._data = [data.get(k) for k in self._index]
            self.name = name
        elif data is None:
            self._data = []
            self._index = []
            self.name = name
        elif isinstance(data, (list, tuple, set, range)):
            self._data = list(data)
            self._index = list(index) if index is not None else list(range(len(self._data)))
            self.name = name
        else:
            if index is not None:
                self._index = list(index)
                self._data = [data for _ in self._index]
            else:
                self._data = [data]
                self._index = [0]
            self.name = name

    @property
    def values(self):
        return list(self._data)

    @property
    def index(self):
        return list(self._index)

    @index.setter
    def index(self, val):
        self._index = list(val)

    @property
    def shape(self):
        return (len(self._data),)

    @property
    def size(self):
        return len(self._data)

    @property
    def empty(self):
        return len(self._data) == 0

    @property
    def dtype(self):
        non_na = [x for x in self._data if not _is_na(x)]
        if not non_na:
            return 'object'
        if all(isinstance(x, bool) for x in non_na):
            return 'bool'
        if all(isinstance(x, int) and not isinstance(x, bool) for x in non_na):
            return 'int64'
        if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in non_na):
            return 'float64'
        return 'object'

    @property
    def str(self):
        return _StringMethods(self)

    @property
    def dt(self):
        return _DateTimeMethods(self)

    @property
    def iloc(self):
        return _SeriesILoc(self)

    @property
    def loc(self):
        return _SeriesLoc(self)

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)

    def items(self):
        return zip(self._index, self._data)

    def iteritems(self):
        return self.items()

    def __getitem__(self, key):
        if isinstance(key, _Series):
            key = key._data
        if isinstance(key, list):
            if len(key) == len(self._data) and all(isinstance(b, bool) for b in key):
                return _Series(
                    [v for v, b in zip(self._data, key) if b],
                    name=self.name,
                    index=[i for i, b in zip(self._index, key) if b]
                )
            return _Series(
                [self._get_by_label_or_pos(k) for k in key],
                name=self.name,
                index=list(key)
            )
        if isinstance(key, slice):
            return _Series(self._data[key], name=self.name, index=self._index[key])
        return self._get_by_label_or_pos(key)

    def _get_by_label_or_pos(self, key):
        if key in self._index:
            return self._data[self._index.index(key)]
        if isinstance(key, int) and -len(self._data) <= key < len(self._data):
            return self._data[key]
        raise KeyError(key)

    def get(self, key, default=None):
        try:
            return self._get_by_label_or_pos(key)
        except (KeyError, IndexError):
            return default

    def _numeric_values(self):
        nums = []
        for x in self._data:
            if _is_na(x):
                continue
            n = _try_parse_number(x)
            if n is not None:
                nums.append(float(n))
        return nums

    def _binop(self, other, op, cmp_mode=False):
        other_list = other._data if isinstance(other, _Series) else [other] * len(self._data)
        out = []
        for a, b in zip(self._data, other_list):
            if _is_na(a) or _is_na(b):
                if cmp_mode == 'eq':
                    out.append(False)
                elif cmp_mode == 'ne':
                    out.append(True)
                elif cmp_mode:
                    out.append(False)
                else:
                    out.append(None)
                continue
            na_num = _try_parse_number(a)
            nb_num = _try_parse_number(b)
            try:
                if na_num is not None and nb_num is not None and not isinstance(a, bool) and not isinstance(b, bool):
                    out.append(op(na_num, nb_num))
                else:
                    out.append(op(a, b))
            except Exception:
                out.append(False if cmp_mode else None)
        return _Series(out, name=self.name, index=list(self._index))

    def __eq__(self, other): return self._binop(other, lambda a, b: a == b, cmp_mode='eq')
    def __ne__(self, other): return self._binop(other, lambda a, b: a != b, cmp_mode='ne')
    def __lt__(self, other): return self._binop(other, lambda a, b: a < b, cmp_mode=True)
    def __le__(self, other): return self._binop(other, lambda a, b: a <= b, cmp_mode=True)
    def __gt__(self, other): return self._binop(other, lambda a, b: a > b, cmp_mode=True)
    def __ge__(self, other): return self._binop(other, lambda a, b: a >= b, cmp_mode=True)

    def __add__(self, other): return self._binop(other, lambda a, b: a + b)
    def __radd__(self, other): return self._binop(other, lambda a, b: b + a)
    def __sub__(self, other): return self._binop(other, lambda a, b: a - b)
    def __rsub__(self, other): return self._binop(other, lambda a, b: b - a)
    def __mul__(self, other): return self._binop(other, lambda a, b: a * b)
    def __rmul__(self, other): return self._binop(other, lambda a, b: b * a)
    def __truediv__(self, other): return self._binop(other, lambda a, b: (a / b) if b != 0 else None)
    def __rtruediv__(self, other): return self._binop(other, lambda a, b: (b / a) if a != 0 else None)
    def __floordiv__(self, other): return self._binop(other, lambda a, b: (a // b) if b != 0 else None)
    def __mod__(self, other): return self._binop(other, lambda a, b: (a % b) if b != 0 else None)
    def __pow__(self, other): return self._binop(other, lambda a, b: a ** b)
    def __neg__(self): return _Series([None if _is_na(x) else -(_try_parse_number(x) or 0) for x in self._data], name=self.name, index=list(self._index))

    def __and__(self, other):
        other_list = other._data if isinstance(other, _Series) else [bool(other)] * len(self._data)
        return _Series([bool(a) and bool(b) for a, b in zip(self._data, other_list)], name=self.name, index=list(self._index))

    def __or__(self, other):
        other_list = other._data if isinstance(other, _Series) else [bool(other)] * len(self._data)
        return _Series([bool(a) or bool(b) for a, b in zip(self._data, other_list)], name=self.name, index=list(self._index))

    def __invert__(self):
        return _Series([not bool(a) for a in self._data], name=self.name, index=list(self._index))

    def sum(self, skipna=True):
        if all(isinstance(x, bool) for x in self._data if not _is_na(x)):
            return sum(1 for x in self._data if x is True)
        nums = self._numeric_values()
        if not nums:
            return 0
        res = sum(nums)
        return int(res) if res == int(res) and all(isinstance(x, int) for x in self._data if not _is_na(x)) else res

    def mean(self, skipna=True):
        if all(isinstance(x, bool) for x in self._data if not _is_na(x)):
            non_na = [1.0 if x else 0.0 for x in self._data if not _is_na(x)]
            return statistics.mean(non_na) if non_na else float('nan')
        nums = self._numeric_values()
        return statistics.mean(nums) if nums else float('nan')

    def median(self, skipna=True):
        nums = self._numeric_values()
        return statistics.median(nums) if nums else float('nan')

    def std(self, ddof=1, skipna=True):
        nums = self._numeric_values()
        if len(nums) <= ddof:
            return float('nan')
        return statistics.stdev(nums) if ddof == 1 else statistics.pstdev(nums)

    def var(self, ddof=1, skipna=True):
        nums = self._numeric_values()
        if len(nums) <= ddof:
            return float('nan')
        return statistics.variance(nums) if ddof == 1 else statistics.pvariance(nums)

    def min(self, skipna=True):
        nums = self._numeric_values()
        if nums:
            res = min(nums)
            return int(res) if res == int(res) and all(isinstance(x, int) for x in self._data if not _is_na(x)) else res
        non_na = [x for x in self._data if not _is_na(x)]
        return min(non_na) if non_na else None

    def max(self, skipna=True):
        nums = self._numeric_values()
        if nums:
            res = max(nums)
            return int(res) if res == int(res) and all(isinstance(x, int) for x in self._data if not _is_na(x)) else res
        non_na = [x for x in self._data if not _is_na(x)]
        return max(non_na) if non_na else None

    def count(self):
        return sum(1 for x in self._data if not _is_na(x))

    def nunique(self, dropna=True):
        vals = [x for x in self._data if not _is_na(x)] if dropna else list(self._data)
        return len(set(vals))

    def unique(self):
        seen = []
        for x in self._data:
            if x not in seen:
                seen.append(x)
        return seen

    def value_counts(self, normalize=False, sort=True, ascending=False, dropna=True):
        counts = collections.Counter()
        for x in self._data:
            if _is_na(x):
                if not dropna:
                    counts[None] += 1
            else:
                counts[x] += 1
        items = list(counts.items())
        if sort:
            items.sort(key=lambda kv: kv[1], reverse=not ascending)
        total = sum(v for _, v in items) or 1
        idx = [k for k, _ in items]
        vals = [v / total if normalize else v for _, v in items]
        return _Series(vals, name=self.name, index=idx)

    def quantile(self, q=0.5):
        nums = sorted(self._numeric_values())
        if not nums:
            return float('nan')
        if isinstance(q, (list, tuple)):
            return _Series([self.quantile(qi) for qi in q], index=list(q), name=self.name)
        pos = q * (len(nums) - 1)
        lo = int(math.floor(pos))
        hi = int(math.ceil(pos))
        if lo == hi:
            return nums[lo]
        return nums[lo] + (pos - lo) * (nums[hi] - nums[lo])

    def idxmax(self):
        best_idx = None
        best_val = None
        for idx_val, x in zip(self._index, self._data):
            if _is_na(x):
                continue
            n = _try_parse_number(x)
            val = n if n is not None else x
            if best_val is None or val > best_val:
                best_val = val
                best_idx = idx_val
        return best_idx

    def idxmin(self):
        best_idx = None
        best_val = None
        for idx_val, x in zip(self._index, self._data):
            if _is_na(x):
                continue
            n = _try_parse_number(x)
            val = n if n is not None else x
            if best_val is None or val < best_val:
                best_val = val
                best_idx = idx_val
        return best_idx

    def isna(self):
        return _Series([_is_na(x) for x in self._data], name=self.name, index=list(self._index))

    def isnull(self):
        return self.isna()

    def notna(self):
        return _Series([not _is_na(x) for x in self._data], name=self.name, index=list(self._index))

    def notnull(self):
        return self.notna()

    def dropna(self):
        pairs = [(i, x) for i, x in zip(self._index, self._data) if not _is_na(x)]
        return _Series([x for _, x in pairs], name=self.name, index=[i for i, _ in pairs])

    def fillna(self, value):
        return _Series([value if _is_na(x) else x for x in self._data], name=self.name, index=list(self._index))

    def isin(self, values):
        val_set = set(values._data if isinstance(values, _Series) else values)
        return _Series([x in val_set for x in self._data], name=self.name, index=list(self._index))

    def between(self, left, right, inclusive='both'):
        if inclusive == 'both':
            return (self >= left) & (self <= right)
        if inclusive == 'neither':
            return (self > left) & (self < right)
        if inclusive == 'left':
            return (self >= left) & (self < right)
        return (self > left) & (self <= right)

    def astype(self, dtype):
        out = []
        for x in self._data:
            if _is_na(x) and dtype not in (str, 'str', 'string', 'object', bool, 'bool'):
                out.append(None)
                continue
            if dtype in (int, 'int', 'int64', 'int32'):
                n = _try_parse_number(x)
                out.append(int(n) if n is not None else 0)
            elif dtype in (float, 'float', 'float64', 'float32'):
                n = _try_parse_number(x)
                out.append(float(n) if n is not None else float('nan'))
            elif dtype in (str, 'str', 'string', 'object'):
                out.append('' if _is_na(x) else str(x))
            elif dtype in (bool, 'bool'):
                out.append(bool(x) and not _is_na(x))
            else:
                out.append(x)
        return _Series(out, name=self.name, index=list(self._index))

    def apply(self, fn):
        return _Series([fn(x) for x in self._data], name=self.name, index=list(self._index))

    def map(self, arg):
        if callable(arg):
            return self.apply(arg)
        if isinstance(arg, dict):
            return _Series([arg.get(x) for x in self._data], name=self.name, index=list(self._index))
        return self

    def replace(self, to_replace, value=None, regex=False):
        out = []
        if isinstance(to_replace, dict):
            for x in self._data:
                if _is_na(x):
                    out.append(x)
                elif regex:
                    s = str(x)
                    for pat, repl in to_replace.items():
                        s = re.sub(str(pat), str(repl), s)
                    out.append(s)
                else:
                    out.append(to_replace.get(x, x))
            return _Series(out, name=self.name, index=list(self._index))
        repl_str = '' if value is None else str(value)
        for x in self._data:
            if _is_na(x):
                out.append(x if not regex else '')
            elif regex:
                out.append(re.sub(str(to_replace), repl_str, str(x)))
            else:
                out.append(value if x == to_replace else x)
        return _Series(out, name=self.name, index=list(self._index))

    def round(self, decimals=0):
        out = []
        for x in self._data:
            n = _try_parse_number(x)
            out.append(round(n, decimals) if n is not None else x)
        return _Series(out, name=self.name, index=list(self._index))

    def abs(self):
        return _Series([abs(_try_parse_number(x)) if _try_parse_number(x) is not None else x for x in self._data], name=self.name, index=list(self._index))

    def cumsum(self):
        total = 0
        out = []
        for x in self._data:
            n = _try_parse_number(x)
            if n is None:
                out.append(None)
            else:
                total += n
                out.append(total)
        return _Series(out, name=self.name, index=list(self._index))

    def sort_values(self, ascending=True, na_position='last'):
        valid = []
        nas = []
        for i, x in zip(self._index, self._data):
            if _is_na(x):
                nas.append((i, x))
            else:
                n = _try_parse_number(x)
                valid.append((i, x, (0, n) if n is not None else (1, str(x))))
        valid.sort(key=lambda t: t[2], reverse=not ascending)
        ordered = ([(i, x) for i, x, _ in valid] + nas) if na_position == 'last' else (nas + [(i, x) for i, x, _ in valid])
        return _Series([x for _, x in ordered], name=self.name, index=[i for i, _ in ordered])

    def head(self, n=5):
        return _Series(self._data[:n], name=self.name, index=self._index[:n])

    def tail(self, n=5):
        return _Series(self._data[-n:] if n > 0 else [], name=self.name, index=self._index[-n:] if n > 0 else [])

    def nlargest(self, n=5):
        return self.sort_values(ascending=False).head(n)

    def nsmallest(self, n=5):
        return self.sort_values(ascending=True).head(n)

    def corr(self, other):
        pairs = []
        for a, b in zip(self._data, other._data if isinstance(other, _Series) else other):
            na = _try_parse_number(a)
            nb = _try_parse_number(b)
            if na is not None and nb is not None:
                pairs.append((float(na), float(nb)))
        if len(pairs) < 2:
            return float('nan')
        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        try:
            return statistics.correlation(xs, ys)
        except Exception:
            return float('nan')

    def reset_index(self, drop=False, name=None):
        if drop:
            return _Series(list(self._data), name=self.name)
        col_name = name or self.name or 'value'
        idx_name = 'index'
        rows = [{idx_name: i, col_name: v} for i, v in zip(self._index, self._data)]
        return _DataFrame(rows, columns=[idx_name, col_name])

    def to_list(self):
        return list(self._data)

    def tolist(self):
        return list(self._data)

    def to_dict(self):
        return dict(zip(self._index, self._data))

    def to_frame(self, name=None):
        col = name or self.name or '0'
        return _DataFrame([{col: v} for v in self._data], columns=[col], index=list(self._index))

    def describe(self):
        nums = self._numeric_values()
        if nums:
            s_nums = sorted(nums)
            return _Series({
                'count': float(len(nums)),
                'mean': statistics.mean(nums),
                'std': statistics.stdev(nums) if len(nums) > 1 else 0.0,
                'min': min(nums),
                '25%': self.quantile(0.25),
                '50%': statistics.median(s_nums),
                '75%': self.quantile(0.75),
                'max': max(nums),
            }, name=self.name)
        non_na = [x for x in self._data if not _is_na(x)]
        top_val, top_freq = (collections.Counter(non_na).most_common(1)[0]) if non_na else (None, 0)
        return _Series({
            'count': len(non_na),
            'unique': len(set(non_na)),
            'top': top_val,
            'freq': top_freq,
        }, name=self.name)

    def to_string(self):
        lines = [f"{i}    {v}" for i, v in zip(self._index, self._data)]
        if self.name:
            lines.append(f"Name: {self.name}, dtype: {self.dtype}")
        return "\n".join(lines)

    def __repr__(self):
        return self.to_string()

    def __str__(self):
        return self.to_string()

class _GroupBySeries:
    def __init__(self, groups, col_name, as_index=True, group_cols=None):
        self._groups = groups
        self._col = col_name
        self._as_index = as_index
        self._group_cols = group_cols or ['group']

    def _agg_one(self, fn_name, values):
        s = _Series(values, name=self._col)
        if callable(fn_name):
            return fn_name(s)
        fn = str(fn_name).lower()
        if fn in ('mean', 'avg'): return s.mean()
        if fn == 'sum': return s.sum()
        if fn == 'count': return s.count()
        if fn == 'size': return len(values)
        if fn == 'min': return s.min()
        if fn == 'max': return s.max()
        if fn == 'median': return s.median()
        if fn in ('std', 'stdev'): return s.std()
        if fn == 'var': return s.var()
        if fn == 'nunique': return s.nunique()
        if fn == 'first': return next((x for x in values if not _is_na(x)), None)
        if fn == 'last': return next((x for x in reversed(values) if not _is_na(x)), None)
        raise ValueError(f"Unsupported aggregation: {fn_name}")

    def _run_simple(self, fn_name):
        idx = []
        vals = []
        for k, rows in self._groups.items():
            idx.append(k)
            col_vals = [r.get(self._col) for r in rows]
            vals.append(self._agg_one(fn_name, col_vals))
        if not self._as_index:
            out_rows = []
            for k, v in zip(idx, vals):
                r = {}
                if isinstance(k, tuple):
                    for gc, kv in zip(self._group_cols, k):
                        r[gc] = kv
                else:
                    r[self._group_cols[0]] = k
                r[self._col] = v
                out_rows.append(r)
            return _DataFrame(out_rows)
        return _Series(vals, name=self._col, index=idx)

    def mean(self): return self._run_simple('mean')
    def sum(self): return self._run_simple('sum')
    def count(self): return self._run_simple('count')
    def size(self): return self._run_simple('size')
    def min(self): return self._run_simple('min')
    def max(self): return self._run_simple('max')
    def median(self): return self._run_simple('median')
    def std(self): return self._run_simple('std')
    def var(self): return self._run_simple('var')
    def nunique(self): return self._run_simple('nunique')
    def first(self): return self._run_simple('first')
    def last(self): return self._run_simple('last')

    def agg(self, func=None, *args, **kwargs):
        if isinstance(func, (str, collections.abc.Callable)):
            return self._run_simple(func)
        if isinstance(func, (list, tuple)):
            out_rows = []
            idx = []
            for k, rows in self._groups.items():
                idx.append(k)
                col_vals = [r.get(self._col) for r in rows]
                row_dict = {}
                if not self._as_index:
                    if isinstance(k, tuple):
                        for gc, kv in zip(self._group_cols, k):
                            row_dict[gc] = kv
                    else:
                        row_dict[self._group_cols[0]] = k
                for f in func:
                    fname = f.__name__ if callable(f) else str(f)
                    row_dict[fname] = self._agg_one(f, col_vals)
                out_rows.append(row_dict)
            return _DataFrame(out_rows, index=None if not self._as_index else idx)
        return self.mean()

    aggregate = agg

class _GroupByDataFrame:
    def __init__(self, df, by, as_index=True):
        self._df = df
        self._by = [by] if isinstance(by, str) else list(by)
        self._as_index = as_index
        self._groups = collections.OrderedDict()
        for r in df._rows:
            key = r.get(self._by[0]) if len(self._by) == 1 else tuple(r.get(c) for c in self._by)
            if any(_is_na(k) for k in (key if isinstance(key, tuple) else (key,))):
                continue
            self._groups.setdefault(key, []).append(r)

    def __getitem__(self, col):
        if isinstance(col, str):
            return _GroupBySeries(self._groups, col, as_index=self._as_index, group_cols=self._by)
        return self

    def __iter__(self):
        for k, rows in self._groups.items():
            yield k, _DataFrame(rows, columns=list(self._df.columns))

    def size(self):
        idx = list(self._groups.keys())
        vals = [len(rows) for rows in self._groups.values()]
        if not self._as_index:
            out_rows = []
            for k, v in zip(idx, vals):
                r = {}
                if isinstance(k, tuple):
                    for gc, kv in zip(self._by, k):
                        r[gc] = kv
                else:
                    r[self._by[0]] = k
                r['size'] = v
                out_rows.append(r)
            return _DataFrame(out_rows)
        return _Series(vals, name='size', index=idx)

    def _agg_all_numeric(self, fn_name):
        target_cols = [c for c in self._df.columns if c not in self._by]
        out_rows = []
        idx = []
        for k, rows in self._groups.items():
            idx.append(k)
            row_out = {}
            if not self._as_index:
                if isinstance(k, tuple):
                    for gc, kv in zip(self._by, k):
                        row_out[gc] = kv
                else:
                    row_out[self._by[0]] = k
            for c in target_cols:
                gbs = _GroupBySeries({k: rows}, c)
                row_out[c] = gbs._agg_one(fn_name, [r.get(c) for r in rows])
            out_rows.append(row_out)
        return _DataFrame(out_rows, index=None if not self._as_index else idx)

    def mean(self, numeric_only=True): return self._agg_all_numeric('mean')
    def sum(self, numeric_only=True): return self._agg_all_numeric('sum')
    def count(self): return self._agg_all_numeric('count')
    def min(self, numeric_only=True): return self._agg_all_numeric('min')
    def max(self, numeric_only=True): return self._agg_all_numeric('max')
    def median(self, numeric_only=True): return self._agg_all_numeric('median')
    def std(self, numeric_only=True): return self._agg_all_numeric('std')
    def var(self, numeric_only=True): return self._agg_all_numeric('var')
    def nunique(self): return self._agg_all_numeric('nunique')
    def first(self): return self._agg_all_numeric('first')
    def last(self): return self._agg_all_numeric('last')

    def agg(self, func=None, **kwargs):
        out_rows = []
        idx = []
        for k, rows in self._groups.items():
            idx.append(k)
            row_out = {}
            if not self._as_index:
                if isinstance(k, tuple):
                    for gc, kv in zip(self._by, k):
                        row_out[gc] = kv
                else:
                    row_out[self._by[0]] = k
            if kwargs:
                for alias, spec in kwargs.items():
                    col_name, agg_fn = spec if isinstance(spec, (tuple, list)) else (alias, spec)
                    gbs = _GroupBySeries({k: rows}, col_name)
                    row_out[alias] = gbs._agg_one(agg_fn, [r.get(col_name) for r in rows])
            elif isinstance(func, dict):
                for col_name, agg_spec in func.items():
                    gbs = _GroupBySeries({k: rows}, col_name)
                    vals = [r.get(col_name) for r in rows]
                    if isinstance(agg_spec, (list, tuple)):
                        for f in agg_spec:
                            fname = f.__name__ if callable(f) else str(f)
                            row_out[f"{col_name}_{fname}"] = gbs._agg_one(f, vals)
                    else:
                        row_out[col_name] = gbs._agg_one(agg_spec, vals)
            elif isinstance(func, (str, collections.abc.Callable)):
                return self._agg_all_numeric(func)
            out_rows.append(row_out)
        return _DataFrame(out_rows, index=None if not self._as_index else idx)

    aggregate = agg

    def apply(self, fn):
        results = []
        idx = []
        for k, rows in self._groups.items():
            sub_df = _DataFrame(rows, columns=list(self._df.columns))
            res = fn(sub_df)
            idx.append(k)
            results.append(res)
        if results and isinstance(results[0], _Series):
            out_rows = [r.to_dict() for r in results]
            return _DataFrame(out_rows, index=idx)
        return _Series(results, index=idx)

class _DataFrameILoc:
    def __init__(self, df):
        self._df = df
    def __getitem__(self, idx):
        if isinstance(idx, tuple):
            r_idx, c_idx = idx
            sub = self[r_idx]
            cols = self._df.columns[c_idx] if isinstance(c_idx, slice) else ([self._df.columns[i] for i in c_idx] if isinstance(c_idx, list) else self._df.columns[c_idx])
            if isinstance(sub, _DataFrame):
                return sub[cols]
            return sub[cols]
        if isinstance(idx, slice):
            return _DataFrame(self._df._rows[idx], columns=list(self._df.columns), index=self._df._index[idx])
        if isinstance(idx, list):
            return _DataFrame([self._df._rows[i] for i in idx], columns=list(self._df.columns), index=[self._df._index[i] for i in idx])
        row = self._df._rows[idx]
        return _Series([row.get(c) for c in self._df.columns], index=list(self._df.columns), name=self._df._index[idx])

class _DataFrameLoc:
    def __init__(self, df):
        self._df = df
    def __getitem__(self, idx):
        if isinstance(idx, tuple):
            r_idx, c_idx = idx
            filtered = self[r_idx]
            if isinstance(filtered, _DataFrame):
                return filtered[c_idx]
            return filtered[c_idx]
        if isinstance(idx, _Series):
            idx = idx._data
        if isinstance(idx, list) and all(isinstance(b, bool) for b in idx):
            return _DataFrame(
                [r for r, b in zip(self._df._rows, idx) if b],
                columns=list(self._df.columns),
                index=[i for i, b in zip(self._df._index, idx) if b]
            )
        if idx in self._df._index:
            pos = self._df._index.index(idx)
            row = self._df._rows[pos]
            return _Series([row.get(c) for c in self._df.columns], index=list(self._df.columns), name=idx)
        raise KeyError(idx)

class _DataFrame:
    def __init__(self, data=None, columns=None, index=None):
        self._rows = []
        self._columns = []
        if isinstance(data, _DataFrame):
            self._rows = [dict(r) for r in data._rows]
            self._columns = list(columns) if columns is not None else list(data._columns)
            self._index = list(index) if index is not None else list(data._index)
            return
        if isinstance(data, dict):
            self._columns = list(columns) if columns is not None else list(data.keys())
            col_lists = {}
            max_len = 0
            for k, v in data.items():
                vals = v._data if isinstance(v, _Series) else (list(v) if isinstance(v, (list, tuple, range)) else [v])
                col_lists[k] = vals
                if len(vals) > max_len:
                    max_len = len(vals)
            for i in range(max_len):
                self._rows.append({c: (col_lists.get(c, [None]*max_len)[i] if i < len(col_lists.get(c, [])) else None) for c in self._columns})
        elif isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                if columns is not None:
                    self._columns = list(columns)
                else:
                    seen = []
                    for r in data:
                        for k in r.keys():
                            if k not in seen:
                                seen.append(k)
                    self._columns = seen
                self._rows = [{c: r.get(c) for c in self._columns} for r in data]
            elif len(data) > 0 and isinstance(data[0], (list, tuple)):
                ncols = len(data[0])
                self._columns = list(columns) if columns is not None else [f"col_{i}" for i in range(ncols)]
                self._rows = [dict(zip(self._columns, r)) for r in data]
            else:
                self._columns = list(columns) if columns is not None else ['0']
                self._rows = [{self._columns[0]: x} for x in data]
        else:
            self._columns = list(columns) if columns is not None else []
            self._rows = []
        self._index = list(index) if index is not None else list(range(len(self._rows)))

    @property
    def columns(self):
        return list(self._columns)

    @columns.setter
    def columns(self, new_cols):
        new_cols = list(new_cols)
        old_cols = list(self._columns)
        new_rows = []
        for r in self._rows:
            new_rows.append({new_c: r.get(old_c) for old_c, new_c in zip(old_cols, new_cols)})
        self._columns = new_cols
        self._rows = new_rows

    @property
    def index(self):
        return list(self._index)

    @index.setter
    def index(self, val):
        self._index = list(val)

    @property
    def shape(self):
        return (len(self._rows), len(self._columns))

    @property
    def empty(self):
        return len(self._rows) == 0

    @property
    def dtypes(self):
        return _Series({c: self[c].dtype for c in self._columns}, name='dtypes')

    @property
    def values(self):
        return [[r.get(c) for c in self._columns] for r in self._rows]

    @property
    def iloc(self):
        return _DataFrameILoc(self)

    @property
    def loc(self):
        return _DataFrameLoc(self)

    def __len__(self):
        return len(self._rows)

    def __contains__(self, col):
        return col in self._columns

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        if name in self._columns:
            return self[name]
        raise AttributeError(f"'DataFrame' object has no attribute '{name}'")

    def __getitem__(self, key):
        if isinstance(key, str):
            if key not in self._columns:
                raise KeyError(f"Column '{key}' not found. Available columns: {self._columns}")
            return _Series([r.get(key) for r in self._rows], name=key, index=list(self._index))
        if isinstance(key, _Series):
            key = key._data
        if isinstance(key, list):
            if len(key) == len(self._rows) and all(isinstance(b, bool) for b in key):
                return _DataFrame(
                    [dict(r) for r, b in zip(self._rows, key) if b],
                    columns=list(self._columns),
                    index=[i for i, b in zip(self._index, key) if b]
                )
            for c in key:
                if c not in self._columns:
                    raise KeyError(f"Column '{c}' not found. Available columns: {self._columns}")
            return _DataFrame(
                [{c: r.get(c) for c in key} for r in self._rows],
                columns=list(key),
                index=list(self._index)
            )
        if isinstance(key, slice):
            return _DataFrame(self._rows[key], columns=list(self._columns), index=self._index[key])
        raise KeyError(key)

    def __setitem__(self, key, val):
        if key not in self._columns:
            self._columns.append(key)
        if isinstance(val, _Series):
            vals = val._data
            for i, r in enumerate(self._rows):
                r[key] = vals[i] if i < len(vals) else None
        elif isinstance(val, (list, tuple, range)):
            vals = list(val)
            for i, r in enumerate(self._rows):
                r[key] = vals[i] if i < len(vals) else None
        else:
            for r in self._rows:
                r[key] = val

    def get(self, key, default=None):
        return self[key] if key in self._columns else default

    def copy(self):
        return _DataFrame([dict(r) for r in self._rows], columns=list(self._columns), index=list(self._index))

    def head(self, n=5):
        return _DataFrame(self._rows[:n], columns=list(self._columns), index=self._index[:n])

    def tail(self, n=5):
        return _DataFrame(self._rows[-n:] if n > 0 else [], columns=list(self._columns), index=self._index[-n:] if n > 0 else [])

    def dropna(self, subset=None, how='any', axis=0):
        cols = [subset] if isinstance(subset, str) else (list(subset) if subset else list(self._columns))
        kept_rows = []
        kept_idx = []
        for idx_val, r in zip(self._index, self._rows):
            na_flags = [_is_na(r.get(c)) for c in cols]
            drop = any(na_flags) if how == 'any' else all(na_flags)
            if not drop:
                kept_rows.append(dict(r))
                kept_idx.append(idx_val)
        return _DataFrame(kept_rows, columns=list(self._columns), index=kept_idx)

    def fillna(self, value):
        new_rows = []
        for r in self._rows:
            nr = {}
            for c in self._columns:
                v = r.get(c)
                if _is_na(v):
                    nr[c] = value.get(c, v) if isinstance(value, dict) else value
                else:
                    nr[c] = v
            new_rows.append(nr)
        return _DataFrame(new_rows, columns=list(self._columns), index=list(self._index))

    def sort_values(self, by, ascending=True, na_position='last'):
        by_cols = [by] if isinstance(by, str) else list(by)
        asc_list = [ascending] * len(by_cols) if isinstance(ascending, bool) else list(ascending)
        indexed = list(zip(self._index, self._rows))

        def _row_sort_key(item):
            _, r = item
            key_parts = []
            for col, asc in zip(by_cols, asc_list):
                v = r.get(col)
                if _is_na(v):
                    key_parts.append((1 if na_position == 'last' else -1, 0, ''))
                else:
                    n = _try_parse_number(v)
                    if n is not None:
                        key_parts.append((0, n if asc else -n, ''))
                    else:
                        s = str(v)
                        if asc:
                            key_parts.append((0, 0, s))
                        else:
                            key_parts.append((0, 0, ''.join(chr(0x10FFFF - ord(ch)) for ch in s)))
            return tuple(key_parts)

        indexed.sort(key=_row_sort_key)
        return _DataFrame([dict(r) for _, r in indexed], columns=list(self._columns), index=[i for i, _ in indexed])

    def nlargest(self, n, columns):
        return self.sort_values(by=columns, ascending=False).head(n)

    def nsmallest(self, n, columns):
        return self.sort_values(by=columns, ascending=True).head(n)

    def groupby(self, by, as_index=True, dropna=True):
        return _GroupByDataFrame(self, by, as_index=as_index)

    def reset_index(self, drop=False):
        if drop:
            return _DataFrame([dict(r) for r in self._rows], columns=list(self._columns))
        if self._index == list(range(len(self._rows))):
            return self.copy()
        idx_col = 'index' if 'index' not in self._columns else 'level_0'
        new_cols = [idx_col] + list(self._columns)
        new_rows = []
        for idx_val, r in zip(self._index, self._rows):
            nr = {idx_col: idx_val}
            nr.update(r)
            new_rows.append(nr)
        return _DataFrame(new_rows, columns=new_cols)

    def rename(self, columns=None):
        if not columns:
            return self.copy()
        new_cols = [columns.get(c, c) for c in self._columns]
        new_rows = [{columns.get(k, k): v for k, v in r.items()} for r in self._rows]
        return _DataFrame(new_rows, columns=new_cols, index=list(self._index))

    def drop(self, columns=None, labels=None, axis=0):
        cols_to_drop = set()
        if columns is not None:
            cols_to_drop.update([columns] if isinstance(columns, str) else columns)
        elif axis == 1 and labels is not None:
            cols_to_drop.update([labels] if isinstance(labels, str) else labels)
        if cols_to_drop:
            rem = [c for c in self._columns if c not in cols_to_drop]
            return self[rem]
        return self.copy()

    def drop_duplicates(self, subset=None, keep='first'):
        cols = [subset] if isinstance(subset, str) else (list(subset) if subset else list(self._columns))
        seen = set()
        out_rows = []
        out_idx = []
        for idx_val, r in zip(self._index, self._rows):
            key = tuple(r.get(c) for c in cols)
            if key not in seen:
                seen.add(key)
                out_rows.append(dict(r))
                out_idx.append(idx_val)
        return _DataFrame(out_rows, columns=list(self._columns), index=out_idx)

    def apply(self, fn, axis=0):
        if axis in (1, 'columns'):
            res = [fn(_Series([r.get(c) for c in self._columns], index=list(self._columns), name=i)) for i, r in zip(self._index, self._rows)]
            if res and isinstance(res[0], dict):
                return _DataFrame(res, index=list(self._index))
            return _Series(res, index=list(self._index))
        return _Series({c: fn(self[c]) for c in self._columns})

    def iterrows(self):
        for i, r in zip(self._index, self._rows):
            yield i, _Series([r.get(c) for c in self._columns], index=list(self._columns), name=i)

    def assign(self, **kwargs):
        cp = self.copy()
        for k, v in kwargs.items():
            cp[k] = v(cp) if callable(v) else v
        return cp

    def query(self, expr):
        kept_rows = []
        kept_idx = []
        for idx_val, r in zip(self._index, self._rows):
            env = dict(r)
            if eval(expr, {"__builtins__": {}}, env):
                kept_rows.append(dict(r))
                kept_idx.append(idx_val)
        return _DataFrame(kept_rows, columns=list(self._columns), index=kept_idx)

    def pivot_table(self, values=None, index=None, columns=None, aggfunc='mean', fill_value=None):
        idx_cols = [index] if isinstance(index, str) else list(index or [])
        if not columns:
            return self.groupby(idx_cols)[values].agg(aggfunc).to_frame() if isinstance(values, str) else self.groupby(idx_cols).agg(aggfunc)
        col_vals = sorted(set(r.get(columns) for r in self._rows if not _is_na(r.get(columns))))
        grouped = collections.OrderedDict()
        for r in self._rows:
            ik = r.get(idx_cols[0]) if len(idx_cols) == 1 else tuple(r.get(c) for c in idx_cols)
            ck = r.get(columns)
            grouped.setdefault(ik, {}).setdefault(ck, []).append(r.get(values))
        out_rows = []
        out_idx = []
        for ik, cdict in grouped.items():
            out_idx.append(ik)
            row = {}
            for cv in col_vals:
                cell_vals = cdict.get(cv, [])
                gbs = _GroupBySeries({ik: []}, values)
                val = gbs._agg_one(aggfunc, cell_vals) if cell_vals else fill_value
                row[str(cv)] = fill_value if (val is None or (isinstance(val, float) and math.isnan(val))) and fill_value is not None else val
            out_rows.append(row)
        return _DataFrame(out_rows, columns=[str(c) for c in col_vals], index=out_idx)

    def merge(self, right, on=None, left_on=None, right_on=None, how='inner', suffixes=('_x', '_y')):
        l_key = left_on or on
        r_key = right_on or on
        if isinstance(l_key, str): l_key = [l_key]
        if isinstance(r_key, str): r_key = [r_key]
        r_map = collections.defaultdict(list)
        for rr in right._rows:
            rk = tuple(rr.get(c) for c in r_key)
            r_map[rk].append(rr)
        merged = []
        for lr in self._rows:
            lk = tuple(lr.get(c) for c in l_key)
            matches = r_map.get(lk, [])
            if matches:
                for rr in matches:
                    comb = dict(lr)
                    for k, v in rr.items():
                        if k in r_key and k in l_key:
                            continue
                        if k in comb:
                            comb[k + suffixes[1]] = v
                        else:
                            comb[k] = v
                    merged.append(comb)
            elif how == 'left':
                comb = dict(lr)
                for k in right.columns:
                    if k not in comb:
                        comb[k] = None
                merged.append(comb)
        return _DataFrame(merged)

    def describe(self):
        stats_names = ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max']
        num_cols = [c for c in self._columns if len(self[c]._numeric_values()) > 0]
        target_cols = num_cols if num_cols else list(self._columns)
        desc_map = {c: self[c].describe().to_dict() for c in target_cols}
        rows = []
        idx = stats_names if num_cols else ['count', 'unique', 'top', 'freq']
        for st in idx:
            rows.append({c: desc_map[c].get(st) for c in target_cols})
        return _DataFrame(rows, columns=target_cols, index=idx)

    def info(self):
        lines = [
            f"<DataFrame: {len(self._rows)} entries, {len(self._columns)} columns>",
            " #   Column   Non-Null Count   Dtype",
            "---  ------   --------------   -----"
        ]
        for i, c in enumerate(self._columns):
            s = self[c]
            lines.append(f" {i}   {c}   {s.count()} non-null   {s.dtype}")
        text = "\n".join(lines)
        print(text)
        return text

    def to_dict(self, orient='dict'):
        if orient == 'records':
            return [dict(r) for r in self._rows]
        if orient == 'list':
            return {c: [r.get(c) for r in self._rows] for c in self._columns}
        return {c: dict(zip(self._index, [r.get(c) for r in self._rows])) for c in self._columns}

    def to_markdown(self, index=False):
        headers = (['index'] + list(self._columns)) if index else list(self._columns)
        if not headers:
            return ''
        lines = [
            '| ' + ' | '.join(str(h) for h in headers) + ' |',
            '| ' + ' | '.join('---' for _ in headers) + ' |'
        ]
        for idx_val, r in zip(self._index, self._rows):
            vals = ([idx_val] if index else []) + [r.get(c, '') for c in self._columns]
            fmt = []
            for v in vals:
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    fmt.append('')
                elif isinstance(v, float):
                    fmt.append(f"{v:.4g}" if abs(v) < 100 else f"{v:,.2f}".rstrip('0').rstrip('.'))
                else:
                    fmt.append(str(v))
            lines.append('| ' + ' | '.join(fmt) + ' |')
        return '\n'.join(lines)

    def to_string(self, index=True, max_rows=50):
        if len(self._rows) == 0:
            return f"Empty DataFrame\nColumns: {self._columns}\nIndex: []"
        sub = self.head(max_rows) if max_rows and len(self._rows) > max_rows else self
        return sub.to_markdown(index=index)

    def to_csv(self, path_or_buf=None, index=False):
        buf = io.StringIO()
        writer = csv.writer(buf)
        headers = (['index'] + list(self._columns)) if index else list(self._columns)
        writer.writerow(headers)
        for idx_val, r in zip(self._index, self._rows):
            row = ([idx_val] if index else []) + ['' if _is_na(r.get(c)) else r.get(c) for c in self._columns]
            writer.writerow(row)
        text = buf.getvalue()
        if isinstance(path_or_buf, str):
            with open(path_or_buf, 'w', encoding='utf-8', newline='') as f:
                f.write(text)
            return None
        return text

    def to_json(self, orient='records'):
        return json.dumps(self.to_dict(orient=orient), default=str)

    def __repr__(self):
        return self.to_string()

    def __str__(self):
        return self.to_string()

def _coerce_cell(val):
    if val is None:
        return None
    s = val.strip()
    if s == '' or s in ('NA', 'N/A', 'NaN', 'nan', 'null', 'NULL', 'None', '#N/A'):
        return None
    if re.match(r'^-?(?:0|[1-9]\d*)$', s):
        try:
            return int(s)
        except ValueError:
            pass
    if re.match(r'^-?\d+\.\d+(?:[eE][+-]?\d+)?$', s):
        try:
            return float(s)
        except ValueError:
            pass
    return val

class _MiniPandas:
    DataFrame = _DataFrame
    Series = _Series
    NA = None
    NaT = None

    @staticmethod
    def read_csv(filepath_or_buffer, sep=',', delimiter=None, header='infer', usecols=None, nrows=None, skiprows=None, encoding='utf-8', **kwargs):
        actual_sep = delimiter or sep or ','
        if hasattr(filepath_or_buffer, 'read'):
            content = filepath_or_buffer.read()
        else:
            with open(filepath_or_buffer, 'r', encoding=encoding, errors='replace') as f:
                content = f.read()
        if content.startswith('\ufeff'):
            content = content[1:]
        reader = list(csv.reader(io.StringIO(content), delimiter=actual_sep))
        if isinstance(skiprows, int) and skiprows > 0:
            reader = reader[skiprows:]
        if not reader:
            return _DataFrame([])
        raw_headers = [h.strip() for h in reader[0]]
        data_rows = reader[1:]
        if nrows is not None:
            data_rows = data_rows[:int(nrows)]
        rows = []
        for cells in data_rows:
            if not cells or (len(cells) == 1 and cells[0].strip() == ''):
                continue
            row_dict = {}
            for i, col in enumerate(raw_headers):
                if usecols is not None and col not in usecols and i not in usecols:
                    continue
                raw_val = cells[i] if i < len(cells) else ''
                row_dict[col] = _coerce_cell(raw_val)
            rows.append(row_dict)
        cols = [c for c in raw_headers if (usecols is None or c in usecols)]
        return _DataFrame(rows, columns=cols)

    @staticmethod
    def to_numeric(arg, errors='raise'):
        def _conv(v):
            if _is_na(v):
                return None
            n = _try_parse_number(v)
            if n is not None:
                return n
            if errors == 'coerce':
                return None
            if errors == 'ignore':
                return v
            raise ValueError(f"Unable to parse string '{v}' as numeric")
        if isinstance(arg, _Series):
            return _Series([_conv(x) for x in arg._data], name=arg.name, index=list(arg._index))
        if isinstance(arg, (list, tuple)):
            return [_conv(x) for x in arg]
        return _conv(arg)

    @staticmethod
    def to_datetime(arg, errors='raise', format=None, **kwargs):
        def _conv(v):
            if _is_na(v):
                return None
            dt = _try_parse_datetime(v, fmt=format)
            if dt is not None:
                return dt
            if errors == 'coerce':
                return None
            if errors == 'ignore':
                return v
            raise ValueError(f"Unable to parse '{v}' as datetime")
        if isinstance(arg, _Series):
            return _Series([_conv(x) for x in arg._data], name=arg.name, index=list(arg._index))
        if isinstance(arg, (list, tuple)):
            return [_conv(x) for x in arg]
        return _conv(arg)

    @staticmethod
    def isna(obj):
        if isinstance(obj, _Series):
            return obj.isna()
        return _is_na(obj)

    isnull = isna

    @staticmethod
    def notna(obj):
        if isinstance(obj, _Series):
            return obj.notna()
        return not _is_na(obj)

    notnull = notna

    @staticmethod
    def concat(objs, axis=0, ignore_index=False):
        objs = [o for o in objs if o is not None]
        if not objs:
            return _DataFrame([])
        if isinstance(objs[0], _DataFrame):
            cols = []
            rows = []
            idx = []
            for df in objs:
                for c in df.columns:
                    if c not in cols:
                        cols.append(c)
                rows.extend([dict(r) for r in df._rows])
                idx.extend(df._index)
            return _DataFrame(rows, columns=cols, index=None if ignore_index else idx)
        data = []
        idx = []
        for s in objs:
            data.extend(s._data)
            idx.extend(s._index)
        return _Series(data, index=None if ignore_index else idx)

class _MiniNumpy:
    nan = float('nan')
    NaN = float('nan')
    inf = float('inf')
    pi = math.pi
    e = math.e

    @staticmethod
    def array(obj, dtype=None):
        return _Series(list(obj))

    @staticmethod
    def isnan(x):
        if isinstance(x, _Series):
            return x.isna()
        return _is_na(x)

    @staticmethod
    def mean(a):
        return _Series(a).mean()

    @staticmethod
    def median(a):
        return _Series(a).median()

    @staticmethod
    def std(a, ddof=0):
        return _Series(a).std(ddof=ddof)

    @staticmethod
    def var(a, ddof=0):
        return _Series(a).var(ddof=ddof)

    @staticmethod
    def sum(a):
        return _Series(a).sum()

    @staticmethod
    def min(a):
        return _Series(a).min()

    @staticmethod
    def max(a):
        return _Series(a).max()

    @staticmethod
    def percentile(a, q):
        if isinstance(q, (list, tuple)):
            return [_Series(a).quantile(qi / 100.0) for qi in q]
        return _Series(a).quantile(q / 100.0)

    @staticmethod
    def quantile(a, q):
        return _Series(a).quantile(q)

    @staticmethod
    def round(a, decimals=0):
        if isinstance(a, _Series):
            return a.round(decimals)
        return round(a, decimals)

    @staticmethod
    def where(cond, x, y):
        c_list = cond._data if isinstance(cond, _Series) else list(cond)
        x_list = x._data if isinstance(x, _Series) else ([x] * len(c_list) if not isinstance(x, list) else x)
        y_list = y._data if isinstance(y, _Series) else ([y] * len(c_list) if not isinstance(y, list) else y)
        return _Series([xv if bool(cv) else yv for cv, xv, yv in zip(c_list, x_list, y_list)])

    @staticmethod
    def corrcoef(x, y):
        c = _Series(x).corr(_Series(y))
        return [[1.0, c], [c, 1.0]]

try:
    import numpy as np
except ImportError:
    np = _MiniNumpy()
    sys.modules['numpy'] = np

try:
    import pandas as pd
except ImportError:
    pd = _MiniPandas()
    sys.modules['pandas'] = pd

def _serialize_output(val):
    if val is None or isinstance(val, (bool, int, str)):
        return val
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.isoformat()
    if isinstance(val, decimal.Decimal):
        return float(val)
    if hasattr(val, 'to_dict') and hasattr(val, 'columns'):
        return val.to_dict(orient='records')
    if hasattr(val, 'to_dict') and hasattr(val, 'values'):
        return {_serialize_key(k): _serialize_output(v) for k, v in val.to_dict().items()}
    if isinstance(val, dict):
        return {_serialize_key(k): _serialize_output(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_serialize_output(x) for x in val]
    if hasattr(val, 'tolist'):
        return _serialize_output(val.tolist())
    return str(val)

def _serialize_key(k):
    if isinstance(k, (str, int, float, bool)) or k is None:
        return str(k)
    if isinstance(k, tuple):
        return ' | '.join(str(x) for x in k)
    return str(k)

def _main():
    config_path = sys.argv[1]
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    os.remove(config_path)

    sandbox_dir = os.path.realpath(config['sandboxDir'])
    data_dir = os.path.realpath(config['dataDir'])
    output_dir = os.path.realpath(config['outputDir'])
    code_path = config['codePath']
    with open(code_path, 'r', encoding='utf-8') as f:
        user_code = f.read()
    os.remove(code_path)

    input_data = config.get('inputData')
    csv_files = config.get('csvFiles', [])
    timeout_sec = int(config.get('timeoutSeconds', 30))

    if resource is not None:
        try:
            cpu_lim = max(1, timeout_sec + 2)
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_lim, cpu_lim))
        except Exception:
            pass

    real_stdout = sys.__stdout__
    captured_out = io.StringIO()
    captured_err = io.StringIO()
    sys.stdout = captured_out
    sys.stderr = captured_err

    # Compile before audit hook to catch syntax errors cleanly
    try:
        compiled = compile(user_code, '<sandbox>', 'exec')
    except SyntaxError as e:
        sys.stdout = real_stdout
        real_stdout.write('\n__MJ_PYTHON_RESULT_START__\n')
        real_stdout.write(json.dumps({
            'success': False,
            'errorType': 'SYNTAX_ERROR',
            'error': f"SyntaxError at line {e.lineno}: {e.msg}"
        }))
        real_stdout.write('\n__MJ_PYTHON_RESULT_END__\n')
        real_stdout.flush()
        return

    user_globals = {
        '__name__': '__main__',
        'pd': pd,
        'np': np,
        'csv': csv,
        'json': json,
        'math': math,
        'statistics': statistics,
        'datetime': datetime,
        're': re,
        'collections': collections,
        'itertools': itertools,
        'functools': functools,
        'decimal': decimal,
        'input': input_data,
        'output': None,
        'DATA_DIR': data_dir,
        'OUTPUT_DIR': output_dir,
    }

    if csv_files:
        primary_csv = os.path.join(data_dir, csv_files[0])
        user_globals['CSV_PATH'] = primary_csv
        try:
            user_globals['df'] = pd.read_csv(primary_csv)
        except Exception:
            pass

    allowed_read_prefixes = tuple(
        os.path.realpath(p) for p in (
            sandbox_dir,
            sys.prefix,
            sys.base_prefix,
            sys.exec_prefix,
            os.path.dirname(os.__file__),
        ) if p
    )

    blocked_prefixes = (
        'socket.',
        'urllib.',
        'http.',
        'ftplib.',
        'smtplib.',
        'poplib.',
        'imaplib.',
        'telnetlib.',
        'xmlrpc.',
        'subprocess.',
        'os.system',
        'os.exec',
        'os.spawn',
        'os.posix_spawn',
        'os.fork',
        'pty.',
        'ctypes.dlopen',
    )

    fs_mutation_events = {
        'os.remove', 'os.unlink', 'os.rmdir', 'os.mkdir',
        'os.rename', 'os.replace', 'os.chmod', 'os.chown',
        'os.truncate', 'os.listdir', 'os.scandir', 'os.putenv', 'os.unsetenv'
    }

    sandbox_active = [True]

    def _audit_hook(event, args):
        if not sandbox_active[0]:
            return
        if event.startswith(blocked_prefixes):
            raise PermissionError(f"[SECURITY_ERROR] Operation '{event}' is not permitted in sandboxed Python execution")
        if event == 'open':
            path_arg = args[0]
            mode_arg = str(args[1] or 'r')
            if isinstance(path_arg, int):
                raise PermissionError("[SECURITY_ERROR] File descriptor open is not permitted in sandbox")
            rp = os.path.realpath(str(path_arg))
            is_write = any(m in mode_arg for m in ('w', 'a', 'x', '+'))
            if is_write:
                if not rp.startswith(sandbox_dir):
                    raise PermissionError(f"[SECURITY_ERROR] Writing outside sandbox is not permitted: '{path_arg}'")
            else:
                if not rp.startswith(allowed_read_prefixes):
                    raise PermissionError(f"[SECURITY_ERROR] Reading outside sandbox is not permitted: '{path_arg}'")
        elif event in fs_mutation_events:
            if event in ('os.putenv', 'os.unsetenv'):
                raise PermissionError(f"[SECURITY_ERROR] Modifying environment variables is not permitted")
            path_arg = args[0] if args else ''
            if isinstance(path_arg, (str, bytes)):
                rp = os.path.realpath(path_arg.decode('utf-8', 'replace') if isinstance(path_arg, bytes) else path_arg)
                if not rp.startswith(sandbox_dir):
                    raise PermissionError(f"[SECURITY_ERROR] Filesystem operation '{event}' outside sandbox is not permitted: '{path_arg}'")

    os.chdir(sandbox_dir)
    orig_open = open
    def _sandbox_open(file, mode='r', *args, **kwargs):
        if isinstance(file, str):
            if file == '/data' or file.startswith('/data/'):
                file = os.path.join(data_dir, file[6:])
            elif file == '/output' or file.startswith('/output/'):
                file = os.path.join(output_dir, file[8:])
        return orig_open(file, mode, *args, **kwargs)
    import builtins
    builtins.open = _sandbox_open

    sys.addaudithook(_audit_hook)

    result_payload = None
    try:
        exec(compiled, user_globals)
        sandbox_active[0] = False
        logs = [line for line in captured_out.getvalue().splitlines() if line.strip() != '']
        result_payload = {
            'success': True,
            'output': _serialize_output(user_globals.get('output')),
            'logs': logs,
        }
    except PermissionError as pe:
        sandbox_active[0] = False
        msg = str(pe)
        result_payload = {
            'success': False,
            'errorType': 'SECURITY_ERROR' if '[SECURITY_ERROR]' in msg else 'RUNTIME_ERROR',
            'error': msg.replace('[SECURITY_ERROR] ', ''),
            'logs': [line for line in captured_out.getvalue().splitlines() if line.strip() != ''],
        }
    except MemoryError as me:
        sandbox_active[0] = False
        result_payload = {
            'success': False,
            'errorType': 'MEMORY_LIMIT',
            'error': f"MemoryError: {me}",
        }
    except Exception as exc:
        sandbox_active[0] = False
        tb_lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
        filtered = [l for l in tb_lines if '_mj_runner.py' not in l]
        err_text = ''.join(filtered).strip() or f"{type(exc).__name__}: {exc}"
        result_payload = {
            'success': False,
            'errorType': 'RUNTIME_ERROR',
            'error': err_text,
            'logs': [line for line in captured_out.getvalue().splitlines() if line.strip() != ''],
        }

    sys.stdout = real_stdout
    real_stdout.write('\n__MJ_PYTHON_RESULT_START__\n')
    real_stdout.write(json.dumps(result_payload))
    real_stdout.write('\n__MJ_PYTHON_RESULT_END__\n')
    real_stdout.flush()

if __name__ == '__main__':
    _main()
`;
