import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from app.main import _extract_importance

X = np.array([[0.0, 1.0], [1.0, 0.0], [0.0, 0.0], [1.0, 1.0]])
y = np.array([0, 1, 0, 1])


def test_linear_model_reports_coefficient_kind() -> None:
    _, kind = _extract_importance(LogisticRegression().fit(X, y), ["a", "b"])
    assert kind == "coefficient"


def test_tree_model_reports_split_or_impurity_kind() -> None:
    _, kind = _extract_importance(RandomForestClassifier(n_estimators=3, random_state=0).fit(X, y), ["a", "b"])
    assert kind == "split_or_impurity"
