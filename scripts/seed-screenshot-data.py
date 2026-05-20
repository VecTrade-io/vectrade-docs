"""Seed data for VTrade screenshots — creates develop@vectrade.io user,
portfolio snapshots (performance calendar), feed posts with hashtags,
and meaningful message conversations.

Usage:
    cd vectrade-core && python ../vectrade-docs/scripts/seed-screenshot-data.py
"""

import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

# Add vectrade-core to path for password hashing only
CORE_ROOT = Path(__file__).resolve().parent.parent.parent / "vectrade-core"
sys.path.insert(0, str(CORE_ROOT))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

DATABASE_URL = "postgresql+asyncpg://trading:trading@localhost:5432/trading"

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# ─── Constants ───
DEVELOPER_EMAIL = "develop@vectrade.io"
DEVELOPER_DISPLAY_NAME = "Vectrade Developer"
DEVELOPER_PASSWORD = "***REDACTED***"


async def get_or_create_developer(db) -> uuid.UUID:
    """Get or create the develop@vectrade.io user using raw SQL."""
    result = await db.execute(
        text("SELECT id, display_name FROM users WHERE email = :email"),
        {"email": DEVELOPER_EMAIL},
    )
    row = result.fetchone()

    if row:
        user_id = row[0]
        if row[1] != DEVELOPER_DISPLAY_NAME:
            await db.execute(
                text("UPDATE users SET display_name = :name WHERE id = :id"),
                {"name": DEVELOPER_DISPLAY_NAME, "id": str(user_id)},
            )
        print(f"  ✓ User exists: {user_id} ({DEVELOPER_DISPLAY_NAME})")
        return user_id

    # Hash password using the project's utility
    from trading.user.auth import hash_password
    pw_hash = hash_password(DEVELOPER_PASSWORD)

    user_id = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO users (id, email, display_name, password_hash, user_type, status,
                          email_verified, portfolio_visibility, referral_code, bankruptcy_count,
                          reactivation_count, xp, rank_tier, follower_count, is_premium_creator,
                          subscriber_count, is_admin, is_active, connection_count, post_count,
                          failed_login_attempts, created_at, updated_at)
        VALUES (:id, :email, :name, :pw, 'HUMAN', 'ACTIVE',
                true, 'REALTIME', :ref, 0,
                0, 500, 'SILVER', 0, false,
                0, false, true, 0, 0,
                0, NOW(), NOW())
    """), {
        "id": str(user_id),
        "email": DEVELOPER_EMAIL,
        "name": DEVELOPER_DISPLAY_NAME,
        "pw": pw_hash,
        "ref": f"DEV{uuid.uuid4().hex[:8].upper()}",
    })

    # Create wallet
    await db.execute(text("""
        INSERT INTO wallets (id, user_id, balance, total_deposited, total_withdrawn, created_at, updated_at)
        VALUES (:id, :uid, 50000, 50000, 0, NOW(), NOW())
        ON CONFLICT (user_id) DO NOTHING
    """), {"id": str(uuid.uuid4()), "uid": str(user_id)})

    print(f"  ✓ Created user: {user_id} ({DEVELOPER_DISPLAY_NAME})")
    return user_id


async def seed_portfolio_snapshots(db, user_id: uuid.UUID):
    """Seed 60 days of portfolio snapshots for performance calendar."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM portfolio_snapshots WHERE user_id = :uid"),
        {"uid": str(user_id)},
    )
    count = result.scalar()
    if count and count > 0:
        print(f"  ✓ Portfolio snapshots exist ({count}) — skipping")
        return

    random.seed(42)
    today = date.today()
    equity = Decimal("100000.00")
    inserted = 0

    for i in range(60, 0, -1):
        snap_date = today - timedelta(days=i)
        if snap_date.weekday() >= 5:
            continue

        daily_return = Decimal(str(round(random.gauss(0.001, 0.015), 5)))
        equity = equity * (1 + daily_return)
        equity = max(equity, Decimal("50000"))

        cash = equity * Decimal("0.15")
        positions_value = equity - cash

        positions_json = (
            '{"AAPL": {"value": ' + str(float(positions_value * Decimal("0.25"))) +
            ', "shares": 45}, "GOOGL": {"value": ' + str(float(positions_value * Decimal("0.20"))) +
            ', "shares": 12}, "MSFT": {"value": ' + str(float(positions_value * Decimal("0.20"))) +
            ', "shares": 30}, "NVDA": {"value": ' + str(float(positions_value * Decimal("0.20"))) +
            ', "shares": 8}, "TSLA": {"value": ' + str(float(positions_value * Decimal("0.15"))) +
            ', "shares": 20}}'
        )

        await db.execute(text("""
            INSERT INTO portfolio_snapshots (id, user_id, snapshot_date, total_equity, cash_balance, positions, metrics)
            VALUES (:id, :uid, :sdate, :equity, :cash, CAST(:pos AS jsonb), CAST(:metrics AS jsonb))
        """), {
            "id": str(uuid.uuid4()),
            "uid": str(user_id),
            "sdate": snap_date,
            "equity": str(equity.quantize(Decimal("0.0001"))),
            "cash": str(cash.quantize(Decimal("0.0001"))),
            "pos": positions_json,
            "metrics": f'{{"sharpe_ratio": {round(random.uniform(0.8, 2.1), 2)}, "max_drawdown": {round(random.uniform(-0.05, -0.01), 3)}}}',
        })
        inserted += 1

    print(f"  ✓ Seeded {inserted} portfolio snapshots")


async def seed_feed_posts(db, user_id: uuid.UUID):
    """Seed feed posts with meaningful trading content and hashtags."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM posts WHERE author_id = :uid"),
        {"uid": str(user_id)},
    )
    count = result.scalar()
    if count and count > 0:
        print(f"  ✓ Feed posts exist ({count}) — skipping")
        return

    # Get NPC user IDs
    npc_rows = (await db.execute(
        text("SELECT id FROM users WHERE email LIKE '%@bot.local' ORDER BY display_name LIMIT 5")
    )).fetchall()
    npc_ids = [str(row[0]) for row in npc_rows]

    now = datetime.now(timezone.utc)

    posts = [
        {
            "author_id": str(user_id),
            "body": "Just closed my $NVDA position at +32% 🚀 The AI infrastructure buildout is far from over but taking profits here feels right. Added to $MSFT on the pullback instead. #AIStocks #TechTrading #PortfolioManagement",
            "hashtags": ["AIStocks", "TechTrading", "PortfolioManagement"],
            "symbol": "NVDA",
            "sentiment": "BULLISH",
            "reactions": 24, "comments": 8, "views": 192,
        },
        {
            "author_id": str(user_id),
            "body": "Weekly portfolio review: Up 2.3% this week, outperforming SPX by 80bps. Key contributors were $GOOGL earnings beat and the semiconductor recovery. Rebalancing toward defensives next week. #WeeklyReview #PortfolioManagement #MarketAnalysis",
            "hashtags": ["WeeklyReview", "PortfolioManagement", "MarketAnalysis"],
            "symbol": "GOOGL",
            "sentiment": "BULLISH",
            "reactions": 18, "comments": 5, "views": 144,
        },
        {
            "author_id": npc_ids[0] if npc_ids else str(user_id),
            "body": "Interesting divergence between $AAPL and the broader tech sector. While NASDAQ is up 1.5%, AAPL is lagging on iPhone demand concerns. Could be a buying opportunity if the 200-day SMA holds. #TechnicalAnalysis #AAPL #DipBuying",
            "hashtags": ["TechnicalAnalysis", "AAPL", "DipBuying"],
            "symbol": "AAPL",
            "sentiment": "NEUTRAL",
            "reactions": 31, "comments": 12, "views": 248,
        },
        {
            "author_id": npc_ids[1] if len(npc_ids) > 1 else str(user_id),
            "body": "Fed minutes released — no surprises. Market pricing in 2 rate cuts this year. Bond yields barely moved. Staying long equities but adding gold as a hedge. #MacroTrading #FedWatch #RiskManagement",
            "hashtags": ["MacroTrading", "FedWatch", "RiskManagement"],
            "symbol": None,
            "sentiment": "NEUTRAL",
            "reactions": 45, "comments": 15, "views": 360,
        },
        {
            "author_id": npc_ids[2] if len(npc_ids) > 2 else str(user_id),
            "body": "Backtested a mean-reversion strategy on $SPY using 20-day Bollinger Bands. Sharpe ratio of 1.8 over 5 years. Paper trading it this month before sizing up. #QuantTrading #Backtesting #AlgoTrading",
            "hashtags": ["QuantTrading", "Backtesting", "AlgoTrading"],
            "symbol": "SPY",
            "sentiment": "BULLISH",
            "reactions": 56, "comments": 22, "views": 448,
        },
        {
            "author_id": str(user_id),
            "body": "My top 3 lessons from this quarter:\n1. Size positions based on conviction, not FOMO\n2. Take partial profits — don't let winners become losers\n3. Journal every trade — patterns emerge over time\n\n#TradingWisdom #RiskManagement #TradingJournal",
            "hashtags": ["TradingWisdom", "RiskManagement", "TradingJournal"],
            "symbol": None,
            "sentiment": None,
            "reactions": 89, "comments": 34, "views": 712,
        },
        {
            "author_id": npc_ids[3] if len(npc_ids) > 3 else str(user_id),
            "body": "Earnings season recap: 78% of S&P 500 companies beat estimates. Revenue growth strongest in tech (+12% YoY) and healthcare (+8%). Energy was the laggard. Positioning for Q3 accordingly. #EarningsSeason #MarketAnalysis #SectorRotation",
            "hashtags": ["EarningsSeason", "MarketAnalysis", "SectorRotation"],
            "symbol": None,
            "sentiment": "BULLISH",
            "reactions": 37, "comments": 9, "views": 296,
        },
        {
            "author_id": npc_ids[4] if len(npc_ids) > 4 else str(user_id),
            "body": "Just hit my first 100-trade milestone on VTrade! Win rate: 62%, avg R:R of 1:2.3. The platform's analytics helped me identify my best setups are morning gap plays. #Milestone #TradingStats #AIStocks",
            "hashtags": ["Milestone", "TradingStats", "AIStocks"],
            "symbol": None,
            "sentiment": "BULLISH",
            "reactions": 112, "comments": 41, "views": 896,
        },
    ]

    for i, p in enumerate(posts):
        ts = now - timedelta(hours=i * 6 + 1)
        await db.execute(text("""
            INSERT INTO posts (id, author_id, body, content_type, hashtags, symbol, sentiment, visibility,
                              reaction_count, comment_count, repost_count, view_count,
                              is_pinned, is_deleted, created_at, updated_at)
            VALUES (:id, :author, :body, 'TEXT', :tags, :symbol, :sentiment, 'PUBLIC',
                    :reactions, :comments, 0, :views,
                    false, false, :ts, :ts)
        """), {
            "id": str(uuid.uuid4()),
            "author": p["author_id"],
            "body": p["body"],
            "tags": p["hashtags"],
            "symbol": p["symbol"],
            "sentiment": p["sentiment"],
            "reactions": p["reactions"],
            "comments": p["comments"],
            "views": p["views"],
            "ts": ts,
        })

    print(f"  ✓ Seeded {len(posts)} feed posts with hashtags")


async def seed_messages(db, user_id: uuid.UUID):
    """Seed meaningful message conversations."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM conversation_members WHERE user_id = :uid"),
        {"uid": str(user_id)},
    )
    count = result.scalar()
    if count and count > 0:
        print(f"  ✓ Messages exist ({count} conversations) — skipping")
        return

    npc_rows = (await db.execute(
        text("SELECT id, display_name FROM users WHERE email LIKE '%@bot.local' ORDER BY display_name LIMIT 4")
    )).fetchall()

    if len(npc_rows) < 2:
        print("  ✗ Not enough NPC users for messaging — skipping")
        return

    now = datetime.now(timezone.utc)
    uid = str(user_id)

    # ── Conversation 1: Trading strategy with first NPC ──
    conv1_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO conversations (id, conversation_type, last_message_at, created_at)
        VALUES (:id, 'DIRECT', :lm, NOW())
    """), {"id": conv1_id, "lm": (now - timedelta(minutes=15))})

    await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'MEMBER', false, NOW())"),
                     {"id": str(uuid.uuid4()), "cid": conv1_id, "uid": uid})
    await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'MEMBER', false, NOW())"),
                     {"id": str(uuid.uuid4()), "cid": conv1_id, "uid": str(npc_rows[0][0])})

    conv1_msgs = [
        (str(npc_rows[0][0]), "Hey! I saw your NVDA trade post — great timing on that exit. What's your take on the semiconductor cycle?", 120),
        (uid, "Thanks! I think we're mid-cycle — TSMC guidance was strong and data center demand isn't slowing. But valuations are getting stretched so I'm being selective.", 90),
        (str(npc_rows[0][0]), "Agreed. I'm watching $AMD for a pullback to the 150 level. Their AI chip lineup is underappreciated relative to NVDA.", 60),
        (uid, "Good call. I have AMD on my watchlist too. The MI300 reviews have been solid. Want to compare our screener settings?", 30),
        (str(npc_rows[0][0]), "Definitely! I'll share my momentum + value composite filter. Works great for identifying these kinds of setups.", 15),
    ]

    for sender, body, mins_ago in conv1_msgs:
        await db.execute(text("""
            INSERT INTO messages (id, conversation_id, sender_id, body, is_system, is_deleted, created_at, updated_at)
            VALUES (:id, :cid, :sid, :body, false, false, :ts, :ts)
        """), {"id": str(uuid.uuid4()), "cid": conv1_id, "sid": sender, "body": body, "ts": (now - timedelta(minutes=mins_ago))})

    # ── Conversation 2: Portfolio review with second NPC ──
    conv2_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO conversations (id, conversation_type, last_message_at, created_at)
        VALUES (:id, 'DIRECT', :lm, NOW())
    """), {"id": conv2_id, "lm": (now - timedelta(hours=2))})

    await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'MEMBER', false, NOW())"),
                     {"id": str(uuid.uuid4()), "cid": conv2_id, "uid": uid})
    await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'MEMBER', false, NOW())"),
                     {"id": str(uuid.uuid4()), "cid": conv2_id, "uid": str(npc_rows[1][0])})

    conv2_msgs = [
        (uid, "Quinn, quick question — what risk-free rate are you using for Sharpe calculations? I'm seeing different values across platforms.", 180),
        (str(npc_rows[1][0]), "I use the 3-month T-bill rate, currently around 5.25%. Some platforms use 10Y which gives lower Sharpe numbers.", 150),
        (uid, "That explains the discrepancy. My VTrade Sharpe shows 1.85 but another tool shows 1.42. Different benchmarks.", 130),
        (str(npc_rows[1][0]), "Exactly. VTrade uses 3M T-bill which is the academic standard. For comparing across platforms, just be consistent.", 120),
    ]

    for sender, body, mins_ago in conv2_msgs:
        await db.execute(text("""
            INSERT INTO messages (id, conversation_id, sender_id, body, is_system, is_deleted, created_at, updated_at)
            VALUES (:id, :cid, :sid, :body, false, false, :ts, :ts)
        """), {"id": str(uuid.uuid4()), "cid": conv2_id, "sid": sender, "body": body, "ts": (now - timedelta(minutes=mins_ago))})

    # ── Conversation 3: Group chat ──
    conv3_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO conversations (id, conversation_type, name, description, created_by, last_message_at, created_at)
        VALUES (:id, 'GROUP', 'Trading Ideas 💡', 'Share and discuss trade setups', :creator, :lm, NOW())
    """), {"id": conv3_id, "creator": uid, "lm": (now - timedelta(hours=1))})

    await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'OWNER', false, NOW())"),
                     {"id": str(uuid.uuid4()), "cid": conv3_id, "uid": uid})
    for npc in npc_rows[:3]:
        await db.execute(text("INSERT INTO conversation_members (id, conversation_id, user_id, role, is_muted, joined_at) VALUES (:id, :cid, :uid, 'MEMBER', false, NOW())"),
                         {"id": str(uuid.uuid4()), "cid": conv3_id, "uid": str(npc[0])})

    conv3_msgs = [
        (str(npc_rows[0][0]), "Morning everyone! Futures are green — looks like the market liked the jobs data. Any plays today?", 240),
        (uid, "I'm watching MSFT for a breakout above 430. Strong cloud revenue could push it there this week.", 200),
        (str(npc_rows[1][0]), "Interesting. My quant model has MSFT rated 'strong buy' right now. Momentum + fundamentals aligned.", 170),
        (str(npc_rows[2][0]), "I'm more cautious — RSI is at 68 on the daily. Might wait for a small pullback before entering.", 140),
        (uid, "Good point. I'll set a limit order at 425 instead of market. Better risk/reward that way.", 60),
    ]

    for sender, body, mins_ago in conv3_msgs:
        await db.execute(text("""
            INSERT INTO messages (id, conversation_id, sender_id, body, is_system, is_deleted, created_at, updated_at)
            VALUES (:id, :cid, :sid, :body, false, false, :ts, :ts)
        """), {"id": str(uuid.uuid4()), "cid": conv3_id, "sid": sender, "body": body, "ts": (now - timedelta(minutes=mins_ago))})

    total_msgs = len(conv1_msgs) + len(conv2_msgs) + len(conv3_msgs)
    print(f"  ✓ Seeded 3 conversations with {total_msgs} messages")


async def seed_wallet_transactions(db, user_id: uuid.UUID):
    """Ensure at least 12 wallet transactions for Load More demo."""
    # Get wallet first
    result = await db.execute(
        text("SELECT id, balance FROM wallets WHERE user_id = :uid"),
        {"uid": str(user_id)},
    )
    wallet_row = result.fetchone()
    if not wallet_row:
        print("  ✗ No wallet found — skipping")
        return

    result = await db.execute(
        text("SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = :wid"),
        {"wid": str(wallet_row[0])},
    )
    count = result.scalar() or 0
    if count >= 12:
        print(f"  ✓ Wallet has {count} transactions — sufficient")
        return

    now = datetime.now(timezone.utc)
    balance = float(wallet_row[1])
    needed = 12 - count

    templates = [
        ("Daily login bonus", 50, "STREAK_REWARD"),
        ("Trade profit: AAPL", 320, "TRADE_CREDIT"),
        ("Quiz completion reward", 100, "QUIZ_REWARD"),
        ("Competition prize — Weekly Challenge", 1000, "COMPETITION_PRIZE"),
        ("Referral bonus", 500, "REFERRAL_BONUS"),
        ("Trade profit: GOOGL", 450, "TRADE_CREDIT"),
        ("Mission completed: First 10 Trades", 200, "MISSION_REWARD"),
        ("Trade loss: TSLA", -150, "TRADE_DEBIT"),
        ("Premium subscription", -299, "SUBSCRIPTION_PAYMENT"),
        ("Trade profit: NVDA", 780, "TRADE_CREDIT"),
        ("Tip sent to @AlgoAlice", -25, "TIP_SENT"),
        ("Streak reward: 7-day streak", 150, "STREAK_REWARD"),
        ("Trade profit: MSFT", 210, "TRADE_CREDIT"),
        ("Copilot session", -50, "COPILOT_SESSION_DEBIT"),
    ]

    for i in range(needed):
        desc, amount, tx_type = templates[i % len(templates)]
        balance += amount

        await db.execute(text("""
            INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, description, created_at)
            VALUES (:id, :wid, :type, :amount, :balance, :desc, :ts)
        """), {
            "id": str(uuid.uuid4()),
            "wid": str(wallet_row[0]),
            "type": tx_type,
            "amount": amount,
            "balance": balance,
            "desc": desc,
            "ts": (now - timedelta(hours=i * 4 + 1)),
        })

    # Update wallet balance
    await db.execute(
        text("UPDATE wallets SET balance = :bal WHERE user_id = :uid"),
        {"bal": balance, "uid": str(user_id)},
    )

    print(f"  ✓ Seeded {needed} wallet transactions (total: {count + needed})")


async def main():
    print("═══════════════════════════════════════════")
    print("  VTrade Screenshot Data Seeder")
    print("═══════════════════════════════════════════")
    print()

    async with SessionLocal() as db:
        async with db.begin():
            print("[1/5] Creating developer user...")
            user_id = await get_or_create_developer(db)

            print("[2/5] Seeding portfolio snapshots (performance calendar)...")
            await seed_portfolio_snapshots(db, user_id)

            print("[3/5] Seeding feed posts with hashtags...")
            await seed_feed_posts(db, user_id)

            print("[4/5] Seeding message conversations...")
            await seed_messages(db, user_id)

            print("[5/5] Seeding wallet transactions...")
            await seed_wallet_transactions(db, user_id)

    await engine.dispose()
    print()
    print("═══════════════════════════════════════════")
    print("  Done! Login with:")
    print(f"    Email:    {DEVELOPER_EMAIL}")
    print(f"    Password: {DEVELOPER_PASSWORD}")
    print(f"    Name:     {DEVELOPER_DISPLAY_NAME}")
    print("═══════════════════════════════════════════")


if __name__ == "__main__":
    asyncio.run(main())
