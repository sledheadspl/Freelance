-- Store active_listing_count in comps_cache so cache hits don't require
-- a live eBay Browse API call on every scan.
alter table comps_cache add column if not exists active_listing_count int;
