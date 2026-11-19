SELECT PipelineID, COUNT(*) AS Published FROM __mj.MLModel WHERE Status = 'Published' GROUP BY PipelineID HAVING COUNT(*) > 1
