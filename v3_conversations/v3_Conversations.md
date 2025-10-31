* Entities to Deprecate
    * Conversation Artifacts
    * Conversation Artifact Versions
    * These entities will still exist in the DB, for 3.x lifecycle maybe, but we will build a data conversion script that moves data from here into the new entities 
* New Entities
    * Artifacts
        * This will be very similar to the old one but not "bound" to a conversation. 
        * Has a SpaceID - see below
    * Artifact Versions
        * Ditto
    * Artifact Links
        * This would be a join table that links Artifacts to Conversations and Space Libraries (see below) so that an artifact can live in multiple places
    * Spaces
        * In my mind we need some kind of organizing container that is represented in the hierarchy that has conversations and libraries and artifacts within it. In nearly all cases a user would be in just one Space but it is possible we could have many and toggle between them but I wouldn't even surface that complexity. I just want everything tied to a container for future flexibility
        * In our 3.0.0 migration script/setup script, we would auto generate a Default space for each MJ database and probably have same GUID for it globally and then use that to update all existing conversations
    * Space Libraries
        * Just the DB name to separate this from Component Libraries and other things with similar names, in UI would be just Libraries to end user
    * Permission/Sharing Tables
        * We would have a set of tables for Spaces, Conversations, and Artifacts that are ACL-like tables for controlling access, granting sharing and so on
        * I want to also enable the idea of an artifact being sharable outside of an organization if an org allows this and specifies which users are allowed to create public links - security issue so we need to think this through deeply
* Updated Entities
    * Conversations
        * Add a SpaceID that is auto-populated to the Default space for all existing convos when we migrate
    * Dashboards Reports
        * We would update these to also have a SpaceID for same reason
        * I think the concept of Reports maybe actually goes away? Artifacts could incorporate them and we can make artifacts what Dashboards display?
        * Nobody currently uses Dashboards TMK so we could easily do this
* Agent Framework Enhancement (Future)
    * Update agent framework to support artifacts as first-class input/output concepts
    * Currently has inbound/outbound payload concept but no artifact integration
    * Agents should be able to:
        * Accept INPUT artifacts as context (documents, data, templates)
        * Produce OUTPUT artifacts as results (code, reports, analyses)
        * Declare which artifact types they can process/generate
    * This will enable better agent orchestration and task assignment
