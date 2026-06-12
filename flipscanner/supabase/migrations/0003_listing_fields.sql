-- Listing draft fields for the eBay listing generator (Build Order step 8)
alter table inventory
  add column listing_title text,
  add column listing_description text;
