UPDATE __mj.Action SET CategoryID='15E03732-607E-4125-86F4-8C846EE88749' WHERE CategoryID='9AE3480B-41FF-4E4A-A5F0-EB009465B26A' -- update actions to the category we are keeping
DELETE FROM __mj.ActionCategory WHERE ID='9AE3480B-41FF-4E4A-A5F0-EB009465B26A' -- remove duplicate system category
