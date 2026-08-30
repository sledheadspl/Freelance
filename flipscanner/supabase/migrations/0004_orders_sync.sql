-- Push notification token for order-sold alerts (Build Order step 10)
alter table profiles
  add column push_token text;
