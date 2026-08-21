// Domain row types (hand-written, mirror the Postgres schema).

export type Role = "finance" | "sales" | "management";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  sales_pic: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  account_name: string;
  bank: string | null;
  current_balance: number;
  balance_as_of: string | null;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: "expense" | "payable";
  active: boolean;
}

export interface PaymentMethod {
  id: string;
  name: string;
  active: boolean;
}

export interface Receivable {
  id: string;
  client_name: string;
  contact_name: string | null;
  product: string | null;
  sales_pic: string | null;
  deal_date: string | null;
  original_amount: number;
  total_receivable: number;
  currency: string;
  payment_plan_type: string;
  hrdc_applicable: boolean;
  status: "active" | "completed" | "cancelled" | "on_hold" | "stopped";
  notes: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSchedule {
  id: string;
  receivable_id: string;
  due_date: string;
  expected_amount: number;
  sort_order: number;
  notes: string | null;
}

export interface ReceivablePayment {
  id: string;
  receivable_id: string;
  amount: number;
  received_date: string;
  payment_method_id: string | null;
  reference: string | null;
  notes: string | null;
  voided: boolean;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  schedule_id: string | null;
  amount: number;
}

export interface RecurringPayable {
  id: string;
  name: string;
  payee: string | null;
  category_id: string | null;
  frequency: "monthly" | "quarterly" | "yearly";
  due_day: number;
  default_amount: number;
  amount_type: "fixed" | "variable";
  payment_method_id: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
}

export interface Payable {
  id: string;
  payee: string;
  category_id: string | null;
  description: string | null;
  amount: number;
  due_date: string;
  payment_method_id: string | null;
  status: "unpaid" | "paid" | "cancelled";
  paid_date: string | null;
  paid_amount: number | null;
  reference: string | null;
  notes: string | null;
  recurring_rule_id: string | null;
  period_key: string | null;
}

export type ExpenseStatus =
  | "new"
  | "awaiting_payment"
  | "paid"
  | "awaiting_verification"
  | "verified"
  | "cancelled";

export interface Expense {
  id: string;
  vendor: string;
  invoice_date: string | null;
  received_date: string | null;
  category_id: string | null;
  department: string | null;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: ExpenseStatus;
  paid_date: string | null;
  payment_method_id: string | null;
  reference: string | null;
  verified_by: string | null;
  verified_date: string | null;
  notes: string | null;
}

export interface HrdcClaim {
  id: string;
  receivable_id: string | null;
  client_name: string;
  contact_name: string | null;
  product: string | null;
  sales_pic: string | null;
  amount_client_paid: number | null;
  claim_amount: number | null;
  approved_amount: number | null;
  hrdc_amount_received: number | null;
  hrdc_received_date: string | null;
  refund_amount_due: number | null;
  grant_application_date: string | null;
  grant_reference: string | null;
  grant_approval_date: string | null;
  grant_status: string | null;
  training_start_date: string | null;
  training_end_date: string | null;
  documents_complete: boolean;
  documents_collected_date: string | null;
  claim_submitted_date: string | null;
  claim_status: string | null;
  claim_approved_date: string | null;
  query_received: boolean;
  query_received_date: string | null;
  query_details: string | null;
  query_replied_date: string | null;
  refund_payment_method_id: string | null;
  refund_reference: string | null;
  grant_approval_notification_sent: boolean;
  grant_approval_notification_date: string | null;
  refund_processing_notification_sent: boolean;
  refund_processing_notification_date: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrdcRefund {
  id: string;
  claim_id: string;
  amount: number;
  refund_date: string;
  payment_method_id: string | null;
  reference: string | null;
  notes: string | null;
}
