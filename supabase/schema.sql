-- Digital Khata & Billing - Complete Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  mobile TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- SHOPS
-- ============================================
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  mobile TEXT,
  gstin TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mobile TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gstin TEXT,
  customer_type TEXT DEFAULT 'Individual',
  opening_balance NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(shop_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(shop_id, mobile);

-- ============================================
-- BILLS
-- ============================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_interstate BOOLEAN DEFAULT FALSE,
  tax_inclusive BOOLEAN DEFAULT FALSE,
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount_amount NUMERIC(14,2) DEFAULT 0,
  taxable_amount NUMERIC(14,2) DEFAULT 0,
  cgst_amount NUMERIC(14,2) DEFAULT 0,
  sgst_amount NUMERIC(14,2) DEFAULT 0,
  igst_amount NUMERIC(14,2) DEFAULT 0,
  total_gst NUMERIC(14,2) DEFAULT 0,
  round_off NUMERIC(14,2) DEFAULT 0,
  grand_total NUMERIC(14,2) DEFAULT 0,
  advance_adjusted NUMERIC(14,2) DEFAULT 0,
  amount_paid NUMERIC(14,2) DEFAULT 0,
  amount_due NUMERIC(14,2) DEFAULT 0,
  due_date DATE,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
  notes TEXT,
  terms TEXT,
  is_offline BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(shop_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_bills_shop ON bills(shop_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(shop_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(shop_id, due_date);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(shop_id, payment_status);

-- ============================================
-- BILL ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Piece',
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  gst_percent NUMERIC(5,2) DEFAULT 0,
  taxable_amount NUMERIC(14,2) DEFAULT 0,
  gst_amount NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  payment_mode TEXT DEFAULT 'Cash',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  notes TEXT,
  is_advance BOOLEAN DEFAULT FALSE,
  is_refund BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(shop_id, payment_date DESC);

-- ============================================
-- CUSTOMER ADVANCES
-- ============================================
CREATE TABLE IF NOT EXISTS customer_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advances_customer ON customer_advances(customer_id);
CREATE INDEX IF NOT EXISTS idx_advances_shop ON customer_advances(shop_id);

-- ============================================
-- ADVANCE ALLOCATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS advance_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advance_id UUID NOT NULL REFERENCES customer_advances(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocations_advance ON advance_allocations(advance_id);
CREATE INDEX IF NOT EXISTS idx_allocations_bill ON advance_allocations(bill_id);

-- ============================================
-- KHATA ENTRIES (Personal Khata)
-- ============================================
CREATE TABLE IF NOT EXISTS khata_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  mobile TEXT,
  address TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('you_gave', 'customer_paid', 'new_due', 'advance_received', 'advance_returned')),
  amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) DEFAULT 0,
  due_date DATE,
  notes TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_khata_shop ON khata_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_khata_customer ON khata_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_khata_date ON khata_entries(shop_id, entry_date DESC);

-- ============================================
-- BILL ATTACHMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS bill_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INT,
  bill_number TEXT,
  bill_date DATE,
  total_amount NUMERIC(14,2),
  amount_paid NUMERIC(14,2) DEFAULT 0,
  amount_due NUMERIC(14,2) DEFAULT 0,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_shop ON bill_attachments(shop_id);
CREATE INDEX IF NOT EXISTS idx_attachments_customer ON bill_attachments(customer_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER shops_updated_at BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bills_updated_at BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER advances_updated_at BEFORE UPDATE ON customer_advances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO CREATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, mobile)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'mobile', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_attachments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Shops policies
CREATE POLICY "Users can view own shops" ON shops
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own shops" ON shops
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own shops" ON shops
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own shops" ON shops
  FOR DELETE USING (auth.uid() = owner_id);

-- Helper: shop ownership check
CREATE OR REPLACE FUNCTION user_owns_shop(shop_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops WHERE id = shop_uuid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Customers policies
CREATE POLICY "Users can view shop customers" ON customers
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop customers" ON customers
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop customers" ON customers
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop customers" ON customers
  FOR DELETE USING (user_owns_shop(shop_id));

-- Bills policies
CREATE POLICY "Users can view shop bills" ON bills
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop bills" ON bills
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop bills" ON bills
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop bills" ON bills
  FOR DELETE USING (user_owns_shop(shop_id));

-- Bill items policies
CREATE POLICY "Users can view bill items" ON bill_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_id AND user_owns_shop(b.shop_id))
  );
CREATE POLICY "Users can create bill items" ON bill_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_id AND user_owns_shop(b.shop_id))
  );
CREATE POLICY "Users can update bill items" ON bill_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_id AND user_owns_shop(b.shop_id))
  );
CREATE POLICY "Users can delete bill items" ON bill_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_id AND user_owns_shop(b.shop_id))
  );

-- Payments policies
CREATE POLICY "Users can view shop payments" ON payments
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop payments" ON payments
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop payments" ON payments
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop payments" ON payments
  FOR DELETE USING (user_owns_shop(shop_id));

-- Advances policies
CREATE POLICY "Users can view shop advances" ON customer_advances
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop advances" ON customer_advances
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop advances" ON customer_advances
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop advances" ON customer_advances
  FOR DELETE USING (user_owns_shop(shop_id));

-- Advance allocations
CREATE POLICY "Users can view allocations" ON advance_allocations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM customer_advances a WHERE a.id = advance_id AND user_owns_shop(a.shop_id))
  );
CREATE POLICY "Users can create allocations" ON advance_allocations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM customer_advances a WHERE a.id = advance_id AND user_owns_shop(a.shop_id))
  );
CREATE POLICY "Users can delete allocations" ON advance_allocations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM customer_advances a WHERE a.id = advance_id AND user_owns_shop(a.shop_id))
  );

-- Khata entries
CREATE POLICY "Users can view shop khata" ON khata_entries
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop khata" ON khata_entries
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop khata" ON khata_entries
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop khata" ON khata_entries
  FOR DELETE USING (user_owns_shop(shop_id));

-- Bill attachments
CREATE POLICY "Users can view shop attachments" ON bill_attachments
  FOR SELECT USING (user_owns_shop(shop_id));
CREATE POLICY "Users can create shop attachments" ON bill_attachments
  FOR INSERT WITH CHECK (user_owns_shop(shop_id));
CREATE POLICY "Users can update shop attachments" ON bill_attachments
  FOR UPDATE USING (user_owns_shop(shop_id));
CREATE POLICY "Users can delete shop attachments" ON bill_attachments
  FOR DELETE USING (user_owns_shop(shop_id));

-- ============================================
-- STORAGE BUCKET for bill attachments
-- ============================================
-- Run in Supabase dashboard or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('bill-attachments', 'bill-attachments', false);

-- Storage policies (run after creating bucket):
-- CREATE POLICY "Users can upload own attachments" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'bill-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can view own attachments" ON storage.objects
--   FOR SELECT USING (bucket_id = 'bill-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can delete own attachments" ON storage.objects
--   FOR DELETE USING (bucket_id = 'bill-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- HELPER VIEWS / FUNCTIONS for balances
-- ============================================
CREATE OR REPLACE FUNCTION get_customer_balance(p_customer_id UUID)
RETURNS TABLE (
  total_billed NUMERIC,
  total_paid NUMERIC,
  total_advance NUMERIC,
  outstanding NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(grand_total) FROM bills WHERE customer_id = p_customer_id), 0),
    COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = p_customer_id AND is_advance = FALSE AND is_refund = FALSE), 0)
      + COALESCE((SELECT SUM(advance_adjusted) FROM bills WHERE customer_id = p_customer_id), 0),
    COALESCE((SELECT SUM(remaining_amount) FROM customer_advances WHERE customer_id = p_customer_id AND remaining_amount > 0), 0),
    COALESCE((SELECT SUM(amount_due) FROM bills WHERE customer_id = p_customer_id AND amount_due > 0), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
