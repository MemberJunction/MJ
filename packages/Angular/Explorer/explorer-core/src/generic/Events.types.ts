import { Folder, Item } from "./Item.types";

/**
 * The possible event types of an event
 */
export const EventTypes = {
    BeforeAddFolder: "BeforeAddFolder",
    BeforeAddItem: "BeforeAddItem",
    BeforeDeleteFolder: "BeforeDeleteFolder",
    BeforeDeleteItem: "BeforeDeleteItem",
    BeforeUnlinkItem: "BeforeUnlinkItem",
    BeforeUpdateFolder: "BeforeUpdateFolder",
    BeforeUpdateItem: "BeforeUpdateItem",

    AfterAddFolder: "AfterAddFolder",
    AfterAddItem: "AfterAddItem",
    AfterDeleteFolder: "AfterDeleteFolder",
    AfterDeleteItem: "AfterDeleteItem",
    AfterUnlinkItem: "AfterUnlinkItem",
    AfterUpdateFolder: "AfterUpdateFolder",
    AfterUpdateItem: "AfterUpdateItem"
} as const;

export type EventTypes = typeof EventTypes[keyof typeof EventTypes];

export class BaseEvent {
    /**
     * The type of {@link EventTypes} that is being triggered.
     */
    public EventType: EventTypes;
    /**
     * If set to true, the child component that it should not proceed
     * with the action that triggered this event.
     */
    public Cancel: boolean;

    constructor(eventType: EventTypes){
        this.EventType = eventType;
        this.Cancel = false;
    }
}

export class BeforeAddFolderEvent extends BaseEvent {
    /**
     * The name of the {@link Folder} to be added.
     */
    public FolderName: string;

    constructor(folderName: string){
        super(EventTypes.BeforeAddFolder);
        this.FolderName = folderName;
    }
}

export class BeforeAddItemEvent extends BaseEvent {
    /**
     * The name of the {@link Item} to be added.
     */
    public ItemName: string;

    constructor(itemName: string){
        super(EventTypes.BeforeAddItem);
        this.ItemName = itemName;
    }
}

export class BeforeDeleteFolderEvent extends BaseEvent {
    /**
     * The {@link Item} and underlying {@link Folder} to be deleted.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.BeforeDeleteFolder);
        this.Item = item;
    }
}

export class BeforeDeleteItemEvent extends BaseEvent {
    /**
     * The {@link Item} and its underlying data to be deleted.
     * Note that the type variable for the Data property is set to any.
     * The method subscribing to this event is responsible
     * for casting the item to the correct type.
     * 
     * There is no need to check if the Item's type is a Folder or a Resource,
     * as it will always be of type Resource. For folder deletion events
     * subscribe to the {@link BeforeDeleteFolderEvent} event.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.BeforeDeleteItem);
        this.Item = item;
    }
}

export class BeforeUnlinkItemEvent extends BaseEvent {
    /**
     * The {@link Item} and its underlying data to be unlinked.
     * Note that the type variable for the Data property is set to any.
     * The method subscribing to this event is responsible
     * for casting the item to the correct type.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.BeforeUnlinkItem);
        this.Item = item;
    }

}

export class BeforeUpdateFolderEvent extends BaseEvent {
    /**
     * The {@link Folder} to update.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.BeforeUpdateFolder);
        this.Item = item;
    }
}

export class BeforeUpdateItemEvent extends BaseEvent {
    /**
     * The {@link Item} and its underlying data to update.
     * Note that the type variable for the Data property is set to any.
     * The method subscribing to this event is responsible
     * for casting the item to the correct type.
     * 
     * There is no need to check if the Item's type is a Folder or a Resource,
     * as it will always be of type Resource. For folder deletion events
     * subscribe to the {@link BeforeUpdateFolderEvent} event.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.BeforeUpdateItem);
        this.Item = item;
    }
}

export class AfterAddFolderEvent extends BaseEvent {
    /**
     * The {@link Folder} that was added.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterAddFolder);
        this.Item = item;
    }
}

export class AfterAddItemEvent extends BaseEvent {
    /**
     * The {@link Item} that was added.
     * 
     * There is no need to check if the Item's type is a Folder or a Resource,
     * as it will always be of type Resource. For folder deletion events
     * subscribe to the {@link AfterUpdateFolderEvent} event.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterAddItem);
        this.Item = item;
    }
}

export class AfterDeleteFolderEvent extends BaseEvent {
    /**
     * The {@link Folder} that was deleted.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterDeleteFolder);
        this.Item = item;
    }
}

export class AfterDeleteItemEvent extends BaseEvent {
    /**
     * The {@link Item} that was deleted.
     * 
     * There is no need to check if the Item's type is a Folder or a Resource,
     * as it will always be of type Resource. For folder deletion events
     * subscribe to the {@link AfterDeleteFolderEvent} event.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterDeleteItem);
        this.Item = item;
    }
}


export class AfterUnlinkItemEvent extends BaseEvent {
    /**
     * The {@link Item} that was deleted.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterUnlinkItem);
        this.Item = item;
    }
}

export class AfterUpdateFolderEvent extends BaseEvent {
    /**
     * The {@link Folder} that was updated.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterUpdateFolder);
        this.Item = item;
    }
}

export class AfterUpdateItemEvent extends BaseEvent {
    /**
     * The {@link Item} that was updated.
     * 
     * There is no need to check if the Item's type is a Folder or a Resource,
     * as it will always be of type Resource. For folder deletion events
     * subscribe to the {@link AfterUpdateFolderEvent} event.
     */
    public Item: Item;

    constructor(item: Item){
        super(EventTypes.AfterUpdateItem);
        this.Item = item;
    }
}

export class DropdownOptionClickEvent {
    /**
     * The text of the dropdown option that was clicked.
     */
    public Text: string;

    /**
     * Signals to the source component that another component 
     * has handled responding to this event, and that the source
     * component should do nothing.
     */
    public Cancel: boolean;

    constructor(text: string){
        this.Text = text;
        this.Cancel = false;
    }
}