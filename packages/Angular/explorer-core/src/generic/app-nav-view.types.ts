export class StubData {
    public Name: string;
    public Children: StubData[];

    constructor(name: string, children: StubData[]) {
        this.Name = name;
        this.Children = children;
    }
}