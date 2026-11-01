ALTER TABLE signups
ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'
CHECK (review_status IN ('pending', 'admitted', 'rejected'));
