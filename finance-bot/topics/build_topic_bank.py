"""Generates topics.json: the seeded topic bank.

Run once (or whenever you want to re-seed/expand the bank):
    python topics/build_topic_bank.py

Cross-multiplies a set of base subjects per bucket with a fixed set of
content "angles" to produce >= 360 unique topic entries. Re-running this
script overwrites topics.json, so back up any `used_date` progress first
if you've already been posting (or merge manually).
"""

import json
from pathlib import Path

ANGLES = ["myth", "mistake", "hack", "story", "listicle"]

BUCKETS = {
    "Budgeting & Saving": [
        "the 50/30/20 rule",
        "building a starter emergency fund",
        "zero-based budgeting",
        "cutting subscriptions you forgot about",
        "sinking funds for irregular expenses",
        "cash envelope budgeting in a digital age",
        "automating your savings",
        "the true cost of small daily purchases",
        "how much emergency fund is actually enough",
    ],
    "Debt": [
        "the debt snowball method",
        "the debt avalanche method",
        "credit card minimum payments",
        "student loan repayment options",
        "consolidating high-interest debt",
        "when a personal loan makes sense",
        "how debt-to-income ratio affects you",
        "medical debt negotiation",
        "the real cost of carrying a balance",
    ],
    "Investing Basics": [
        "index funds versus individual stocks",
        "what compound interest actually looks like",
        "dollar-cost averaging",
        "the difference between a Roth and traditional account",
        "employer 401(k) matching",
        "expense ratios and why they matter",
        "diversification in plain terms",
        "investing your first $100",
        "how time in the market beats timing the market",
    ],
    "Credit": [
        "how credit scores are calculated",
        "credit utilization ratio",
        "the impact of hard inquiries",
        "building credit from zero",
        "authorized user tricks",
        "how long negative marks stay on a report",
        "secured credit cards",
        "checking your credit report for free",
        "credit mix and account age",
    ],
    "Taxes": [
        "the difference between a deduction and a credit",
        "how tax brackets actually work",
        "common missed deductions",
        "filing status choices",
        "estimated quarterly taxes for side income",
        "standard versus itemized deductions",
        "how withholding affects your refund",
        "tax-advantaged accounts",
        "what happens if you file late",
    ],
    "Money Psychology": [
        "lifestyle creep",
        "loss aversion and spending decisions",
        "the psychology of impulse purchases",
        "why budgets fail emotionally, not mathematically",
        "money scripts from childhood",
        "social comparison and overspending",
        "the sunk cost fallacy with money",
        "delayed gratification and financial outcomes",
        "why saving money can feel harder than earning it",
    ],
    "Life-Stage Money": [
        "money moves in your 20s",
        "money moves in your 30s",
        "preparing finances before having kids",
        "buying a first home versus renting",
        "money habits before a first job",
        "financial checklist before marriage",
        "planning finances in your 40s",
        "money priorities approaching retirement",
        "financial independence timelines by starting age",
    ],
    "Myth-Busting": [
        "you need a perfect credit score to buy a house",
        "renting is always throwing money away",
        "carrying a small credit card balance helps your score",
        "you need a lot of money to start investing",
        "budgets only work if you're strict about every dollar",
        "checking your own credit hurts your score",
        "all debt is bad debt",
        "you should pay off your mortgage before investing",
        "you need a financial advisor to build wealth",
    ],
}


def build() -> list[dict]:
    entries = []
    for bucket, subjects in BUCKETS.items():
        for subject in subjects:
            for angle in ANGLES:
                entries.append(
                    {
                        "topic": subject,
                        "bucket": bucket,
                        "angle": angle,
                        "used_date": None,
                    }
                )
    return entries


def main() -> None:
    entries = build()
    out_path = Path(__file__).parent / "topics.json"
    out_path.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"Wrote {len(entries)} topic entries to {out_path}")


if __name__ == "__main__":
    main()
