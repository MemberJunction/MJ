-- Posts with attachment counts and file type analysis
WITH PostAttachmentStats AS (
  SELECT
    pa.PostID,
    COUNT(pa.ID) AS AttachmentCount,
    SUM(pa.FileSizeBytes) AS TotalSizeBytes,
    SUM(pa.DownloadCount) AS TotalDownloads,
    STRING_AGG(pa.FileType, ', ') AS FileTypes
  FROM [AssociationDemo].[vwPostAttachments] pa
  WHERE pa.UploadedDate >= {{ startDate | sqlDate }}
  GROUP BY pa.PostID
  HAVING COUNT(pa.ID) >= {{ minAttachments | sqlNumber }}
),
FileTypeDistribution AS (
  SELECT
    pa.FileType,
    COUNT(pa.ID) AS FileCount,
    SUM(pa.FileSizeBytes) AS TotalSizeBytes,
    SUM(pa.DownloadCount) AS TotalDownloads
  FROM [AssociationDemo].[vwPostAttachments] pa
  WHERE pa.UploadedDate >= {{ startDate | sqlDate }}
  GROUP BY pa.FileType
)
SELECT
  fp.ID AS PostID,
  fp.ThreadID,
  fp.Content,
  fp.PostedDate,
  fp.AuthorID,
  fp.LikeCount,
  fp.HelpfulCount,
  fp.IsAcceptedAnswer,
  pas.AttachmentCount,
  pas.TotalSizeBytes,
  pas.TotalDownloads,
  pas.FileTypes,
  -- File type distribution (separate result for analysis)
  (SELECT FileType, FileCount, TotalSizeBytes, TotalDownloads 
   FROM FileTypeDistribution 
   ORDER BY FileCount DESC 
   FOR JSON PATH) AS FileTypeDistribution
FROM [AssociationDemo].[vwForumPosts] fp
INNER JOIN PostAttachmentStats pas ON fp.ID = pas.PostID
WHERE fp.Status = 'Published'
ORDER BY pas.AttachmentCount DESC, pas.TotalDownloads DESC