import { ObjectType, InputType, Field } from 'type-graphql';

@ObjectType()
export class MeetingParticipantType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  MeetingID: string;

  @Field(() => String, { nullable: true })
  UserID?: string;

  @Field(() => String, { nullable: true })
  UserName?: string;

  @Field(() => String, { nullable: true })
  UserEmail?: string;

  @Field(() => String, { nullable: true })
  AgentID?: string;

  @Field(() => String, { nullable: true })
  AgentName?: string;

  @Field(() => String, { nullable: true })
  ExternalName?: string;

  @Field(() => String, { nullable: true })
  ExternalEmail?: string;

  @Field(() => String, { nullable: true })
  ExternalPhone?: string;

  @Field(() => String)
  Role: string;

  @Field(() => String)
  InviteStatus: string;

  @Field(() => Date, { nullable: true })
  JoinedAt?: Date;

  @Field(() => Date, { nullable: true })
  LeftAt?: Date;
}

@ObjectType()
export class MeetingType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  Title: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => String)
  HostUserID: string;

  @Field(() => String, { nullable: true })
  HostUserName?: string;

  @Field(() => String)
  RoomName: string;

  @Field(() => String)
  Status: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Date, { nullable: true })
  StartedAt?: Date;

  @Field(() => Date, { nullable: true })
  EndedAt?: Date;

  @Field(() => Boolean)
  AllowPhoneDialIn: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  DialInPhoneNumber?: string;

  @Field(() => String, { nullable: true })
  DialInCode?: string;

  @Field(() => String)
  RecordingPolicy: string;

  @Field(() => String, { nullable: true })
  ConversationID?: string;

  @Field(() => [MeetingParticipantType], { nullable: true })
  Participants?: MeetingParticipantType[];

  @Field(() => Date)
  CreatedAt: Date;

  @Field(() => Date)
  UpdatedAt: Date;
}

@ObjectType()
export class MeetingResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => MeetingType, { nullable: true })
  Meeting?: MeetingType;
}

@ObjectType()
export class StartMeetingResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => MeetingType, { nullable: true })
  Meeting?: MeetingType;

  @Field(() => String, { nullable: true })
  RoomName?: string;

  @Field(() => String, { nullable: true })
  ClientToken?: string;
}

@ObjectType()
export class DialInPhoneNumberType {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  Number: string;

  @Field(() => String, { nullable: true })
  Label?: string;
}

@InputType()
export class MeetingParticipantInput {
  @Field(() => String, { nullable: true })
  UserID?: string;

  @Field(() => String, { nullable: true })
  AgentID?: string;

  @Field(() => String, { nullable: true })
  ExternalName?: string;

  @Field(() => String, { nullable: true })
  ExternalEmail?: string;

  @Field(() => String, { nullable: true })
  ExternalPhone?: string;

  @Field(() => String, { nullable: true })
  Role?: string;
}

@InputType()
export class CreateMeetingInput {
  @Field(() => String)
  Title: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Boolean, { nullable: true })
  AllowPhoneDialIn?: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  RecordingPolicy?: string;

  @Field(() => [MeetingParticipantInput], { nullable: true })
  Participants?: MeetingParticipantInput[];
}

@InputType()
export class UpdateMeetingInput {
  @Field(() => String)
  MeetingID: string;

  @Field(() => String, { nullable: true })
  Title?: string;

  @Field(() => String, { nullable: true })
  Description?: string;

  @Field(() => Date, { nullable: true })
  ScheduledStartAt?: Date;

  @Field(() => Date, { nullable: true })
  ScheduledEndAt?: Date;

  @Field(() => Boolean, { nullable: true })
  AllowPhoneDialIn?: boolean;

  @Field(() => String, { nullable: true })
  DialInPhoneNumberID?: string;

  @Field(() => String, { nullable: true })
  RecordingPolicy?: string;

  @Field(() => [MeetingParticipantInput], { nullable: true })
  Participants?: MeetingParticipantInput[];
}

@InputType()
export class RSVPMeetingInput {
  @Field(() => String)
  MeetingID: string;

  @Field(() => String)
  InviteStatus: string;
}
