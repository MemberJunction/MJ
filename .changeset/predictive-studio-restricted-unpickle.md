---
"@memberjunction/predictive-studio-sidecar": patch
---

Predictive Studio sidecar: model artifacts are deserialized through a restricted unpickler.

joblib is pickle underneath, and pickle resolves and calls importable callables while loading, so a crafted artifact submitted to `/predict` (or written to wherever artifacts are stored) could execute code in the sidecar process (CWE-502, CodeQL py/unsafe-deserialization). The loader now resolves only an exact list of the globals the sidecar's own estimators need (scikit-learn, NumPy, XGBoost and LightGBM classes plus a few reconstructors; nothing that takes a path, URL or code string), routes the element pickle of object-dtype arrays through the same restricted loader (joblib's array wrapper otherwise used a bare `pickle.load` that bypassed the guard), and reports every refusal or malformed payload as a client error (400) instead of a 500. Existing stored artifacts, including compressed ones, load unchanged.
