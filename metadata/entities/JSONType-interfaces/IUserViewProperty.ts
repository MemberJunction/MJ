/**
 * One declared property of a User View: a named, typed input that adds one
 * predicate on a target field when a run gives it a value or it has a default.
 *
 * Stored as a JSON array in the `Properties` column of the `User Views` entity.
 * The same shape is exported from `@memberjunction/core` as `UserViewProperty`,
 * with the resolver that works out token defaults.
 */
export interface IUserViewProperty {
    /** Unique within the view. */
    Name: string;
    /** The value's type. A value of another type is refused. */
    Type: 'string' | 'number' | 'boolean' | 'date' | 'uuid';
    /** Shown to whoever sets the property. */
    Description?: string;
    /** Used when a run gives no value: a fixed value or a context token. */
    Default?: IUserViewPropertyDefault;
    /** True: a run with no value and no default is refused. */
    IsRequired?: boolean;
    /** False: only server code may set it, and a client value is refused. Default true. */
    AllowOverride?: boolean;
    /** The predicate the value drives. */
    Target: IUserViewPropertyTarget;
}

/** A fixed value, or a token worked out when the value is used. */
export interface IUserViewPropertyDefault {
    /** A fixed value. Set this or Token, not both. */
    Value?: string | number | boolean | null;
    /** A context token, worked out from the context user and the clock. */
    Token?:
        | 'Context.UserID' | 'Context.UserEmail' | 'Context.UserName'
        | 'Context.Now' | 'Context.Today'
        | 'Context.StartOfWeek' | 'Context.StartOfMonth' | 'Context.StartOfQuarter' | 'Context.StartOfYear';
    /** Moves a date token; refused on a user token. */
    Offset?: {
        Amount: number;
        Unit: 'day' | 'week' | 'month' | 'quarter' | 'year';
    };
}

/** The field a property filters and how. */
export interface IUserViewPropertyTarget {
    /** A field of the view's entity. */
    Field: string;
    Operator: '=' | '<>' | 'IN' | '>' | '>=' | '<' | '<=';
}
