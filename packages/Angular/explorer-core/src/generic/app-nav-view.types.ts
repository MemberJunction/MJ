export class StubData {
    public Name: string;
    public Children: StubData[];
    public Expanded: boolean = false;

    constructor(name: string, children: StubData[]) {
        this.Name = name;
        this.Children = children;
    }
}