0. Brnad new db 
1. Run mj migrate -t v2.133.0
2. Run migration with sql exec window (change flyway to __mj)
3. Run mj codegen 
4. copy and paste to the bottom of migration file


AIEngineBase
AIEngine

//Add NotificationEngineBase
Cache PreferenceTypeEntity
Have UserInfoEngine store metadata from notificationEngine