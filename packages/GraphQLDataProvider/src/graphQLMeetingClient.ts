import { LogError, type IMetadataProvider } from '@memberjunction/core';
import { gql } from 'graphql-request';
import { GraphQLDataProvider } from './graphQLDataProvider';

export interface MeetingParticipantInfo {
  ID: string;
  MeetingID: string;
  UserID?: string;
  UserName?: string;
  UserEmail?: string;
  AgentID?: string;
  AgentName?: string;
  ExternalName?: string;
  ExternalEmail?: string;
  ExternalPhone?: string;
  Role: 'Host' | 'CoHost' | 'Attendee' | 'Agent';
  InviteStatus: 'Accepted' | 'Declined' | 'Invited' | 'Tentative';
  JoinedAt?: string;
  LeftAt?: string;
}

export interface MeetingInfo {
  ID: string;
  Title: string;
  Description?: string;
  HostUserID: string;
  HostUserName?: string;
  RoomName: string;
  Status: 'Scheduled' | 'Live' | 'Ended' | 'Cancelled';
  ScheduledStartAt?: string;
  ScheduledEndAt?: string;
  StartedAt?: string;
  EndedAt?: string;
  AllowPhoneDialIn: boolean;
  DialInPhoneNumberID?: string;
  DialInPhoneNumber?: string;
  DialInCode?: string;
  RecordingPolicy: 'Off' | 'Allowed' | 'Automatic';
  ConversationID?: string;
  Participants?: MeetingParticipantInfo[];
  CreatedAt: string;
  UpdatedAt: string;
}

export interface DialInPhoneNumberInfo {
  ID: string;
  Number: string;
  Label?: string;
}

export interface MeetingParticipantInput {
  UserID?: string;
  AgentID?: string;
  ExternalName?: string;
  ExternalEmail?: string;
  ExternalPhone?: string;
  Role?: string;
}

export interface CreateMeetingInput {
  Title: string;
  Description?: string;
  ScheduledStartAt?: Date;
  ScheduledEndAt?: Date;
  AllowPhoneDialIn?: boolean;
  DialInPhoneNumberID?: string;
  RecordingPolicy?: string;
  Participants?: MeetingParticipantInput[];
}

export interface UpdateMeetingInput {
  MeetingID: string;
  Title?: string;
  Description?: string;
  ScheduledStartAt?: Date;
  ScheduledEndAt?: Date;
  AllowPhoneDialIn?: boolean;
  DialInPhoneNumberID?: string;
  RecordingPolicy?: string;
  Participants?: MeetingParticipantInput[];
}

export interface RSVPMeetingInput {
  MeetingID: string;
  InviteStatus: 'Accepted' | 'Declined' | 'Tentative';
}

export interface VerifyDialInCodeInput {
  PhoneNumberID: string;
  DialInCode: string;
  CallerPhone?: string;
}

export interface MeetingResult {
  Success: boolean;
  ErrorMessage?: string;
  Meeting?: MeetingInfo;
}

export interface StartMeetingResult {
  Success: boolean;
  ErrorMessage?: string;
  Meeting?: MeetingInfo;
  RoomName?: string;
  ClientToken?: string;
}

export interface VerifyDialInCodeResult {
  Success: boolean;
  ErrorMessage?: string;
  RoomName?: string;
  MeetingID?: string;
}

const MEETING_FIELDS = `
  ID
  Title
  Description
  HostUserID
  HostUserName
  RoomName
  Status
  ScheduledStartAt
  ScheduledEndAt
  StartedAt
  EndedAt
  AllowPhoneDialIn
  DialInPhoneNumberID
  DialInPhoneNumber
  DialInCode
  RecordingPolicy
  ConversationID
  CreatedAt
  UpdatedAt
  Participants {
    ID
    MeetingID
    UserID
    UserName
    UserEmail
    AgentID
    AgentName
    ExternalName
    ExternalEmail
    ExternalPhone
    Role
    InviteStatus
    JoinedAt
    LeftAt
  }
`;

/**
 * Typed client for the MemberJunction **Meeting** GraphQL surface (MJServer `MeetingResolver`).
 */
export class GraphQLMeetingClient {
  private _dataProvider: GraphQLDataProvider;

  constructor(dataProvider?: GraphQLDataProvider | IMetadataProvider) {
    if (dataProvider && 'ExecuteGQL' in dataProvider) {
      this._dataProvider = dataProvider as GraphQLDataProvider;
    } else {
      this._dataProvider = GraphQLDataProvider.Instance;
    }
  }

  public async GetMeeting(id: string): Promise<MeetingInfo | null> {
    return this.Meeting(id);
  }

  public async MyMeetings(status?: string): Promise<MeetingInfo[]> {
    try {
      const query = gql`
        query MyMeetings($status: String) {
          MyMeetings(status: $status) {
            ${MEETING_FIELDS}
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, { status });
      return (result?.MyMeetings ?? []) as MeetingInfo[];
    } catch (error) {
      LogError(`GraphQLMeetingClient.MyMeetings error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  public async Meeting(id: string): Promise<MeetingInfo | null> {
    try {
      const query = gql`
        query Meeting($id: String!) {
          Meeting(id: $id) {
            ${MEETING_FIELDS}
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, { id });
      return (result?.Meeting ?? null) as MeetingInfo | null;
    } catch (error) {
      LogError(`GraphQLMeetingClient.Meeting error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  public async MeetingParticipants(meetingID: string): Promise<MeetingParticipantInfo[]> {
    try {
      const query = gql`
        query MeetingParticipants($meetingID: String!) {
          MeetingParticipants(meetingID: $meetingID) {
            ID
            MeetingID
            UserID
            UserName
            UserEmail
            AgentID
            AgentName
            ExternalName
            ExternalEmail
            ExternalPhone
            Role
            InviteStatus
            JoinedAt
            LeftAt
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, { meetingID });
      return (result?.MeetingParticipants ?? []) as MeetingParticipantInfo[];
    } catch (error) {
      LogError(`GraphQLMeetingClient.MeetingParticipants error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  public async AvailableDialInPhoneNumbers(): Promise<DialInPhoneNumberInfo[]> {
    try {
      const query = gql`
        query AvailableDialInPhoneNumbers {
          AvailableDialInPhoneNumbers {
            ID
            Number
            Label
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, {});
      return (result?.AvailableDialInPhoneNumbers ?? []) as DialInPhoneNumberInfo[];
    } catch (error) {
      LogError(`GraphQLMeetingClient.AvailableDialInPhoneNumbers error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  public async CreateMeeting(input: CreateMeetingInput): Promise<MeetingResult> {
    try {
      const mutation = gql`
        mutation CreateMeeting($input: CreateMeetingInput!) {
          CreateMeeting(input: $input) {
            Success
            ErrorMessage
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { input });
      return (result?.CreateMeeting ?? { Success: false, ErrorMessage: 'No response' }) as MeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.CreateMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async UpdateMeeting(input: UpdateMeetingInput): Promise<MeetingResult> {
    try {
      const mutation = gql`
        mutation UpdateMeeting($input: UpdateMeetingInput!) {
          UpdateMeeting(input: $input) {
            Success
            ErrorMessage
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { input });
      return (result?.UpdateMeeting ?? { Success: false, ErrorMessage: 'No response' }) as MeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.UpdateMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async StartMeeting(meetingID: string): Promise<StartMeetingResult> {
    try {
      const mutation = gql`
        mutation StartMeeting($meetingID: String!) {
          StartMeeting(meetingID: $meetingID) {
            Success
            ErrorMessage
            RoomName
            ClientToken
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { meetingID });
      return (result?.StartMeeting ?? { Success: false, ErrorMessage: 'No response' }) as StartMeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.StartMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async EndMeeting(meetingID: string): Promise<MeetingResult> {
    try {
      const mutation = gql`
        mutation EndMeeting($meetingID: String!) {
          EndMeeting(meetingID: $meetingID) {
            Success
            ErrorMessage
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { meetingID });
      return (result?.EndMeeting ?? { Success: false, ErrorMessage: 'No response' }) as MeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.EndMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async CancelMeeting(meetingID: string): Promise<MeetingResult> {
    try {
      const mutation = gql`
        mutation CancelMeeting($meetingID: String!) {
          CancelMeeting(meetingID: $meetingID) {
            Success
            ErrorMessage
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { meetingID });
      return (result?.CancelMeeting ?? { Success: false, ErrorMessage: 'No response' }) as MeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.CancelMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async RSVPMeeting(input: RSVPMeetingInput): Promise<MeetingResult> {
    try {
      const mutation = gql`
        mutation RSVPMeeting($input: RSVPMeetingInput!) {
          RSVPMeeting(input: $input) {
            Success
            ErrorMessage
            Meeting {
              ${MEETING_FIELDS}
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { input });
      return (result?.RSVPMeeting ?? { Success: false, ErrorMessage: 'No response' }) as MeetingResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.RSVPMeeting error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  public async VerifyMeetingDialInCode(input: VerifyDialInCodeInput): Promise<VerifyDialInCodeResult> {
    try {
      const mutation = gql`
        mutation VerifyMeetingDialInCode($input: VerifyDialInCodeInput!) {
          VerifyMeetingDialInCode(input: $input) {
            Success
            ErrorMessage
            RoomName
            MeetingID
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { input });
      return (result?.VerifyMeetingDialInCode ?? { Success: false, ErrorMessage: 'No response' }) as VerifyDialInCodeResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`GraphQLMeetingClient.VerifyMeetingDialInCode error: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }
}
