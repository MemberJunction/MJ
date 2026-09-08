---
"@memberjunction/predictive-studio-sidecar": patch
---

Predictive Studio sidecar: model artifacts are deserialized through a restricted unpickler.

joblib is pickle underneath, and pickle resolves and calls arbitrary importable callables while loading, so a crafted artifact submitted to `/predict` (or written to wherever artifacts are stored) could execute code in the sidecar process (CWE-502, CodeQL py/unsafe-deserialization). The loader now only resolves globals from the estimator libraries the sidecar itself serializes (scikit-learn, NumPy, SciPy, XGBoost, LightGBM, pandas, joblib) plus a short fixed list of standard-library types that estimator pickles need. Anything else is refused with `UnpicklingError` before it is constructed, and a refused artifact is never cached. Existing stored artifacts load unchanged; the format is not altered.
