export type UserRole = "manager" | "admin";
export type IssueStatus = "issued" | "returned" | "overdue";

export type Profile = {
  id: string;
  role: UserRole;
  email: string | null;
  created_at: string;
};

export const MAX_BOOKS_PER_STUDENT = 8;
export const WARN_BOOKS_THRESHOLD = 3;

export type Book = {
  book_id: string;
  name: string;
  author: string;
  publisher: string | null;
  isbn: string | null;
  shelf_no: string | null;
  rack_no: string | null;
  category: string | null;
  sub_category: string | null;
  quantity: number;
  available_quantity: number;
  added_by: string | null;
  created_at: string;
  adder?: { email: string | null } | null;
};

export type Student = {
  student_id: string;
  student_name: string;
  id_number: string;
  mobile: string | null;
  address: string | null;
  alternate_no: string | null;
  parent_name: string | null;
  parent_mobile: string | null;
  additional_details: Record<string, unknown> | null;
  created_at: string;
};

export type BookIssue = {
  issue_id: string;
  book_id: string;
  student_id: string;
  issued_at: string;
  issued_for: number;
  due_date: string;
  returned_at: string | null;
  status: IssueStatus;
  fine_amount: number;
  issued_by: string | null;
  created_at: string;
};

export type BookIssueWithRefs = BookIssue & {
  books: Pick<Book, "name" | "author"> | null;
  students: Pick<Student, "student_name" | "id_number"> | null;
  issuer?: { email: string | null } | null;
};
