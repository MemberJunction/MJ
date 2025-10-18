/**
  The GPT-OSS-20B and 120B models support both streaming and effort level on Groq and Cerebras and the MJ metadata
  incorrectly showed them as not supporting these features.
**/

UPDATE 
    ${flyway:defaultSchema}.AIModelVendor 
SET 
    SupportsEffortLevel=1, 
    SupportsStreaming=1 
WHERE 
    ID IN 
    (
    'FEA7FCBF-3A69-4956-977F-4262DD41C580', -- Groq 20B
    '9CD45EE2-0D5D-448F-9D05-F971C471FB63', -- Cerebras 120B
    'AA3E18FA-2379-49FA-86BB-B33F6F278487' -- Groq 120B
    )