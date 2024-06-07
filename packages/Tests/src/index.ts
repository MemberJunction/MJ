import { AppServerComponent } from '@memberjunction/templates';

// import { AppServerComponent } from '@memberjunction/templates';

AppServerComponent.onReady().subscribe(async () => {
  console.log('AppServerComponent is ready');

  const dataObject = {
    FirstName: 'Jane',
    LastName: 'Doe',
    Title: 'President',
    Address: '123 Main St.',
    City: 'Anytown',
    State: 'CA',
    Country: 'USA',
    Phone: '555-1212',
  };

  // Perform actions that depend on the component being ready
  const startTime = new Date().getTime();
  const result = await AppServerComponent.Instance.render('B', dataObject);
  const endTime = new Date().getTime();
  console.log(result, (endTime - startTime) / 1000 + ' seconds');
});
const main = () => {
  console.log('Hello, Node.js with TypeScript!');
};

main();
