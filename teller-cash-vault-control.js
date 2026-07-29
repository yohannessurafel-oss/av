-- ═══════════════════════════════════════════════════════════
-- AVMF Teller Cash Vault — Balance Guard Migration
-- Run this in Supabase SQL Editor (or psql)
-- ═══════════════════════════════════════════════════════════

-- 1. Ensure running_balance can never be negative
--    (Remove this block if your tills legitimately allow overdrafts)
ALTER TABLE public.teller_transactions
  DROP CONSTRAINT IF EXISTS chk_teller_balance_nonnegative;

ALTER TABLE public.teller_transactions
  ADD CONSTRAINT chk_teller_balance_nonnegative
  CHECK (running_balance >= 0);

-- 2. Auto-compute running_balance on INSERT so the client can never
--    send a stale/wrong value again. The trigger uses the DB's own
--    latest row for the till, eliminating the race condition entirely.
CREATE OR REPLACE FUNCTION public.trg_compute_teller_running_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_latest_balance NUMERIC := 0;
BEGIN
    -- Get the most recent running balance for THIS till
    SELECT COALESCE(running_balance, 0)
      INTO v_latest_balance
      FROM public.teller_transactions
     WHERE till_id = NEW.till_id
     ORDER BY transaction_id DESC
     LIMIT 1;

    -- Asset-side logic: OPEN/RECEIPT = debit (increase), 
    -- PAYMENT/TRANSFER/CLOSE/ADJUSTMENT = credit (decrease)
    IF NEW.transaction_type IN ('PAYMENT', 'TRANSFER', 'CLOSE') THEN
        NEW.running_balance := v_latest_balance - NEW.total_amount;
    ELSIF NEW.transaction_type = 'ADJUSTMENT' THEN
        -- Adjustments are signed by the user via total_amount
        -- Positive = increase, Negative = decrease
        NEW.running_balance := v_latest_balance + NEW.total_amount;
    ELSE
        -- OPEN, RECEIPT
        NEW.running_balance := v_latest_balance + NEW.total_amount;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_compute_teller_balance ON public.teller_transactions;

CREATE TRIGGER tg_compute_teller_balance
  BEFORE INSERT ON public.teller_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_compute_teller_running_balance();

-- 3. Index to make the trigger's "latest balance" lookup instant
CREATE INDEX IF NOT EXISTS idx_teller_tx_till_id_desc 
  ON public.teller_transactions(till_id, transaction_id DESC);
