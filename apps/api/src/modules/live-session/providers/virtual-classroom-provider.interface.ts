export interface CreateMeetingParams {
  subject: string;
  startsAt: Date;
  endsAt: Date;
  organizerUpn: string;
}

export interface CreateMeetingResult {
  providerMeetingId: string;
  joinUrl: string;
  simulated: boolean;
}

export interface AttendanceRecord {
  email: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  durationMin: number | null;
}

export interface UpdateMeetingParams {
  startsAt: Date;
  endsAt: Date;
}

/** Contrato para adapters de aula virtual (Teams hoy; Zoom/Meet en el futuro). */
export interface VirtualClassroomProvider {
  createMeeting(params: CreateMeetingParams): Promise<CreateMeetingResult>;
  getAttendanceReport(providerMeetingId: string, organizerUpn: string): Promise<AttendanceRecord[]>;
  /** Reprograma una reunión ya creada (ver LiveSessionService.reschedule). */
  updateMeeting(providerMeetingId: string, organizerUpn: string, params: UpdateMeetingParams): Promise<void>;
}
