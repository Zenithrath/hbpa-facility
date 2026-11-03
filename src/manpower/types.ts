export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface ManpowerRequest {
  rowId: number;
  sig: string;
  timestamp: string;
  requesterEmail: string;
  requesterName: string;
  department: string;
  division: string;
  requestedDate: string;
  requiredManpower: string;
  jobOutline: string;
}

export interface JobCompletion {
  rowId: number;
  sig: string;
  timestamp: string;
  submittedByEmail: string;
  reportedBy: string;
  jobName: string;
  jobNo: string;
  location: string;
  dateTime: string;
  manpower: string;
  jobDescriptionLog: string;
  endUserName: string;
  endUserPosition: string;
}

export type RequestField = keyof Omit<ManpowerRequest, 'rowId' | 'sig'>;
export type CompletionField = keyof Omit<JobCompletion, 'rowId' | 'sig'>;
export type RequestPatch = Partial<Record<RequestField, string>>;
export type CompletionPatch = Partial<Record<CompletionField, string>>;
