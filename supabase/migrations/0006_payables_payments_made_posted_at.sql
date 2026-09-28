-- When a paid payable was included in a "Recently Paid Payables" Lark post.
-- Null = paid but not posted yet, so the next post picks it up whatever day it went out.
alter table public.payables add column if not exists payments_made_posted_at timestamptz;
