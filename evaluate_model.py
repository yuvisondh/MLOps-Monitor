import os
import pickle

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "fraud_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")
DEFAULT_DATASET_PATH = "/Users/yuviss/Desktop/CreditCardModel/creditcard.csv"
DATASET_PATH = os.getenv("EVAL_DATASET_PATH", DEFAULT_DATASET_PATH)
THRESHOLD = float(os.getenv("PREDICTION_THRESHOLD", "0.5"))
TOP_K = int(os.getenv("TOP_K", "100"))

FEATURE_COLUMNS = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]
TARGET_COLUMN = "Class"


def load_artifacts():
    with open(MODEL_PATH, "rb") as model_file:
        model = pickle.load(model_file)
    with open(SCALER_PATH, "rb") as scaler_file:
        scaler = pickle.load(scaler_file)
    return model, scaler


def preprocess(df, scaler):
    x = df[FEATURE_COLUMNS].copy()
    scaled_time_amount = scaler.transform(x[["Time", "Amount"]])
    x.loc[:, "Time"] = scaled_time_amount[:, 0]
    x.loc[:, "Amount"] = scaled_time_amount[:, 1]
    return x.values.astype(np.float32)


def recall_at_top_k(y_true, y_score, k):
    k = max(1, min(k, len(y_true)))
    top_idx = np.argsort(-y_score)[:k]
    positives_total = int(np.sum(y_true == 1))
    if positives_total == 0:
        return 0.0
    positives_in_top_k = int(np.sum(y_true[top_idx] == 1))
    return positives_in_top_k / positives_total


def main():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Dataset not found at: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Expected target column '{TARGET_COLUMN}' in dataset")

    model, scaler = load_artifacts()

    x = preprocess(df, scaler)
    y_true = df[TARGET_COLUMN].values.astype(int)

    y_score = model.predict(x).reshape(-1)
    y_pred = (y_score >= THRESHOLD).astype(int)

    roc_auc = roc_auc_score(y_true, y_score)
    pr_auc = average_precision_score(y_true, y_score)
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)
    top_k_recall = recall_at_top_k(y_true, y_score, TOP_K)

    print("=== Fraud Model Evaluation ===")
    print(f"Dataset: {DATASET_PATH}")
    print(f"Rows: {len(df)}")
    print(f"Threshold: {THRESHOLD}")
    print(f"Top-K for Recall@K: {TOP_K}")
    print("")
    print(f"ROC-AUC: {roc_auc:.6f}")
    print(f"PR-AUC: {pr_auc:.6f}")
    print(f"Precision@threshold: {precision:.6f}")
    print(f"Recall@threshold: {recall:.6f}")
    print(f"F1@threshold: {f1:.6f}")
    print(f"Recall@Top-{TOP_K}: {top_k_recall:.6f}")
    print("")
    print("Confusion Matrix [[TN, FP], [FN, TP]]:")
    print(cm)


if __name__ == "__main__":
    main()
