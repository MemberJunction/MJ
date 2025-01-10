import { Component, OnInit } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { EntityInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'app-skip',
  templateUrl: './skip.component.html',
  styleUrl: './skip.component.css'
})
export class SkipComponent implements OnInit {
  constructor(public auth: AuthService) {}
  public targetEntities: EntityInfo[] = [];
  public provider: GraphQLDataProvider;
  async ngOnInit() {
    const g = new GraphQLDataProvider();
    const token = GraphQLDataProvider.Instance.ConfigData.Token;
    const url = "http://localhost:4051/"
    const wsurl = "ws://localhost:4051/"
    const config = new GraphQLProviderConfigData(token, url, wsurl, null);
    await g.Config(config, true);    

    this.targetEntities = g.Entities.sort((a, b) => a.Name.localeCompare(b.Name));
    this.provider = g;
  } 
}
