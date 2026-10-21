---
"@memberjunction/livekit-room-server": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Add optional FromNumber to DialIntoRoomRequest (honoured in LiveKitSipTelephonyService with fallback to outboundFromNumber) and expose InteractionID on HandoffOfferInfo, the GraphQL HandoffOffer type, and OFFER_FIELDS.
