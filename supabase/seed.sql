-- FinanceOS demo/seed data. Fictional companies only. Anchored around 2026-08-21.
-- Safe to re-run: clears transactional demo tables first.
begin;

delete from public.payment_allocations;
delete from public.receivable_payments;
delete from public.payment_schedules;
delete from public.hrdc_refunds;
delete from public.hrdc_claims;
delete from public.receivables;
delete from public.payables where period_key is not null or recurring_rule_id is not null or true;
delete from public.recurring_payables;
delete from public.expenses;

do $$
declare
  m_transfer uuid; m_fpx uuid; m_cheque uuid;
  cat_stat uuid; cat_rent uuid; cat_sub uuid; cat_vendor uuid;
  ec_marketing uuid; ec_ops uuid; ec_soft uuid; ec_travel uuid;
  r_id uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; p_id uuid; hc uuid;
begin
  select id into m_transfer from public.payment_methods where name='Bank Transfer' limit 1;
  select id into m_fpx from public.payment_methods where name='FPX Online Banking' limit 1;
  select id into m_cheque from public.payment_methods where name='Cheque' limit 1;
  select id into cat_stat from public.categories where name='Statutory' and kind='payable' limit 1;
  select id into cat_rent from public.categories where name='Rental' and kind='payable' limit 1;
  select id into cat_sub from public.categories where name='Software Subscription' and kind='payable' limit 1;
  select id into cat_vendor from public.categories where name='Vendor' and kind='payable' limit 1;
  select id into ec_marketing from public.categories where name='Marketing' and kind='expense' limit 1;
  select id into ec_ops from public.categories where name='Operations' and kind='expense' limit 1;
  select id into ec_soft from public.categories where name='Software & Subscriptions' and kind='expense' limit 1;
  select id into ec_travel from public.categories where name='Travel' and kind='expense' limit 1;

  -- =========================================================================
  -- RECEIVABLES
  -- =========================================================================
  -- A) Fully paid
  insert into public.receivables(client_name, product, sales_pic, deal_date, original_amount, total_receivable, payment_plan_type, status)
    values('Acme Widgets Sdn Bhd','Executive Coaching','Aiman Rahman','2026-06-01',12000,12000,'full','completed') returning id into r_id;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-06-01',12000,0) returning id into s1;
  insert into public.receivable_payments(receivable_id, amount, received_date, payment_method_id) values(r_id,12000,'2026-06-01',m_transfer) returning id into p_id;
  insert into public.payment_allocations(payment_id, schedule_id, amount) values(p_id,s1,12000);

  -- B) Partially overdue (paid 3000 of 5000, due date passed)
  insert into public.receivables(client_name, product, sales_pic, deal_date, original_amount, total_receivable, payment_plan_type)
    values('Beacon Logistics Bhd','Sales Bootcamp','Aiman Rahman','2026-07-20',5000,5000,'full') returning id into r_id;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-08-10',5000,0) returning id into s1;
  insert into public.receivable_payments(receivable_id, amount, received_date, payment_method_id) values(r_id,3000,'2026-08-05',m_fpx) returning id into p_id;
  insert into public.payment_allocations(payment_id, schedule_id, amount) values(p_id,s1,3000);

  -- C) Fully overdue, nothing paid
  insert into public.receivables(client_name, product, sales_pic, deal_date, original_amount, total_receivable, payment_plan_type)
    values('Corex Manufacturing','Leadership Program','Siti Nurhaliza','2026-07-01',8000,8000,'full') returning id into r_id;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-08-05',8000,0);

  -- D) Irregular custom plan (scenario C from spec): 20k paid, 5k paid, rest outstanding
  insert into public.receivables(client_name, product, sales_pic, deal_date, original_amount, total_receivable, payment_plan_type)
    values('BrightMinds Academy','Corporate Training Bundle','Siti Nurhaliza','2026-08-01',120000,120000,'custom') returning id into r_id;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-08-01',20000,0) returning id into s1;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-08-15',5000,1) returning id into s2;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-09-01',15000,2) returning id into s3;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-10-15',30000,3) returning id into s4;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-12-01',50000,4) returning id into s5;
  insert into public.receivable_payments(receivable_id, amount, received_date, payment_method_id) values(r_id,20000,'2026-08-01',m_transfer) returning id into p_id;
  insert into public.payment_allocations(payment_id, schedule_id, amount) values(p_id,s1,20000);
  insert into public.receivable_payments(receivable_id, amount, received_date, payment_method_id) values(r_id,5000,'2026-08-15',m_transfer) returning id into p_id;
  insert into public.payment_allocations(payment_id, schedule_id, amount) values(p_id,s2,5000);

  -- E) HRDC-applicable deal, partially collected, monthly plan
  insert into public.receivables(client_name, product, sales_pic, deal_date, original_amount, total_receivable, payment_plan_type, hrdc_applicable)
    values('Delta HRDC Solutions','HRD Corp Certified Program','Aiman Rahman','2026-05-15',30000,30000,'3_instalments',true) returning id into r_id;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-05-15',10000,0) returning id into s1;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-06-15',10000,1) returning id into s2;
  insert into public.payment_schedules(receivable_id, due_date, expected_amount, sort_order) values(r_id,'2026-07-15',10000,2) returning id into s3;
  insert into public.receivable_payments(receivable_id, amount, received_date, payment_method_id) values(r_id,30000,'2026-05-15',m_transfer) returning id into p_id;
  insert into public.payment_allocations(payment_id, schedule_id, amount) values(p_id,s1,10000),(p_id,s2,10000),(p_id,s3,10000);

  -- =========================================================================
  -- RECURRING PAYABLES + generated payables
  -- =========================================================================
  insert into public.recurring_payables(name, payee, category_id, frequency, due_day, default_amount, amount_type, payment_method_id, start_date)
    values('EPF','KWSP', cat_stat, 'monthly', 15, 8500, 'variable', m_transfer, '2026-01-15');
  insert into public.recurring_payables(name, payee, category_id, frequency, due_day, default_amount, amount_type, payment_method_id, start_date)
    values('Office Rental','Sunway REIT', cat_rent, 'monthly', 1, 6500, 'fixed', m_transfer, '2026-01-01');
  insert into public.recurring_payables(name, payee, category_id, frequency, due_day, default_amount, amount_type, payment_method_id, start_date)
    values('SOCSO','PERKESO', cat_stat, 'monthly', 15, 1200, 'variable', m_transfer, '2026-01-15');

  -- generated / one-off payables
  insert into public.payables(payee, category_id, description, amount, due_date, status, period_key,
    recurring_rule_id)
    select 'KWSP', cat_stat, 'EPF', 8500, '2026-08-15', 'unpaid', '2026-08', id from public.recurring_payables where name='EPF';
  insert into public.payables(payee, category_id, description, amount, due_date, status, period_key,
    recurring_rule_id)
    select 'Sunway REIT', cat_rent, 'Office Rental', 6500, '2026-09-01', 'unpaid', '2026-09', id from public.recurring_payables where name='Office Rental';
  insert into public.payables(payee, category_id, description, amount, due_date, status, period_key, paid_date, paid_amount, recurring_rule_id)
    select 'Sunway REIT', cat_rent, 'Office Rental', 6500, '2026-08-01', 'paid', '2026-08', '2026-08-01', 6500, id from public.recurring_payables where name='Office Rental';
  insert into public.payables(payee, category_id, description, amount, due_date, status) values
    ('Canva Pty Ltd', cat_sub, 'Design subscription', 240, '2026-08-23', 'unpaid'),
    ('Overdue Vendor Sdn Bhd', cat_vendor, 'Printing services', 3200, '2026-08-12', 'unpaid'),
    ('AIA Insurance', cat_vendor, 'Group insurance', 4800, '2026-08-21', 'unpaid');

  -- =========================================================================
  -- EXPENSES
  -- =========================================================================
  insert into public.expenses(vendor, invoice_date, received_date, category_id, department, description, amount, due_date, status) values
    ('Facebook Ads', '2026-08-10', '2026-08-11', ec_marketing, 'Marketing', 'August ad spend', 5400, '2026-08-25', 'awaiting_payment'),
    ('Grab for Business', '2026-08-05', '2026-08-06', ec_travel, 'Sales', 'Client visit rides', 320, '2026-08-15', 'awaiting_verification'),
    ('Zoom Video', '2026-08-01', '2026-08-01', ec_soft, 'Operations', 'Annual plan', 960, '2026-08-10', 'verified'),
    ('Kedai Runcit Office', '2026-08-14', '2026-08-14', ec_ops, 'Operations', 'Pantry supplies', 180, '2026-08-20', 'awaiting_payment');
  update public.expenses set paid_date='2026-08-12', payment_method_id=m_transfer where vendor='Grab for Business';
  update public.expenses set paid_date='2026-08-02', payment_method_id=m_transfer, verified_date='2026-08-05' where vendor='Zoom Video';

  -- =========================================================================
  -- HRDC CLAIMS
  -- =========================================================================
  -- Processing (submitted, not received)
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount,
    grant_application_date, grant_approval_date, grant_reference, training_start_date, training_end_date,
    documents_complete, documents_collected_date, claim_submitted_date, claim_status)
    values('Alpha Corp','Digital Marketing Mastery','Aiman Rahman',15000,15000,
      '2026-06-01','2026-06-10','GA-2026-0456','2026-07-01','2026-07-03',true,'2026-07-05','2026-07-08','Under Review');

  -- Query due (received 2026-08-19 -> deadline 2026-08-24)
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount,
    grant_application_date, grant_approval_date, training_start_date, training_end_date,
    documents_complete, claim_submitted_date, query_received, query_received_date, query_details)
    values('Beta Enterprise','Leadership Excellence','Siti Nurhaliza',20000,20000,
      '2026-06-15','2026-06-25','2026-07-10','2026-07-12',true,'2026-07-18',true,'2026-08-19','Please provide the attendance sheet for day 2.');

  -- Refund 20+ days remaining (received 2026-08-15 -> deadline 2026-09-14)
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount, approved_amount,
    hrdc_amount_received, hrdc_received_date, refund_amount_due, stage)
    values('Gamma Holdings','Sales Transformation','Aiman Rahman',18000,18000,18000,18000,'2026-08-15',18000,'client_refund_due');

  -- Refund due within 7 days (received 2026-07-25 -> deadline 2026-08-24)
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount, approved_amount,
    hrdc_amount_received, hrdc_received_date, refund_amount_due, stage)
    values('Zephyr Sdn Bhd','Team Performance','Siti Nurhaliza',9000,9000,9000,9000,'2026-07-25',9000,'client_refund_due') returning id into hc;
  -- partial refund already made
  insert into public.hrdc_refunds(claim_id, amount, refund_date, payment_method_id) values(hc,4000,'2026-08-10',m_transfer);

  -- Overdue refund (received 2026-07-01 -> deadline 2026-07-31)
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount, approved_amount,
    hrdc_amount_received, hrdc_received_date, refund_amount_due, stage)
    values('Epsilon Retail','Customer Service Pro','Aiman Rahman',12000,12000,12000,12000,'2026-07-01',12000,'client_refund_due');

  -- Completed / fully refunded
  insert into public.hrdc_claims(client_name, product, sales_pic, amount_client_paid, claim_amount, approved_amount,
    hrdc_amount_received, hrdc_received_date, refund_amount_due, stage)
    values('Zeta Industries','Operational Excellence','Siti Nurhaliza',10000,10000,10000,10000,'2026-06-20',10000,'completed') returning id into hc;
  insert into public.hrdc_refunds(claim_id, amount, refund_date, payment_method_id) values(hc,10000,'2026-07-05',m_transfer);
end $$;

commit;

select
  (select count(*) from public.receivables) as receivables,
  (select count(*) from public.payment_schedules) as schedules,
  (select count(*) from public.receivable_payments) as payments,
  (select count(*) from public.payables) as payables,
  (select count(*) from public.expenses) as expenses,
  (select count(*) from public.hrdc_claims) as hrdc,
  (select count(*) from public.hrdc_refunds) as refunds;
