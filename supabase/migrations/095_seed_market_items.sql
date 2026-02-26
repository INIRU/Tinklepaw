-- Step 1: Add 'seed' to mc_item_category enum (must be in its own transaction)
alter type nyang.mc_item_category add value if not exists 'seed';
