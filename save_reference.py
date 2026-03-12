from pathlib import Path

import pandas as pd


DATASET_PATH = Path("/Users/yuviss/Desktop/CreditCardModel/creditcard.csv")
OUTPUT_PATH = Path(__file__).resolve().parent / "reference_data.csv"


def main():
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)

    # Take a random sample of rows to use as reference baseline for drift checks.
    reference = df.sample(1000, random_state=42)
    reference.to_csv(OUTPUT_PATH, index=False)

    print(f"Saved {len(reference)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
