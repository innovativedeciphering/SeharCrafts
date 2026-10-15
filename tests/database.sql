\set ON_ERROR_STOP on
insert into auth.users values('11111111-1111-4111-8111-111111111111');
insert into public.owners values('11111111-1111-4111-8111-111111111111');
insert into public.products(id,name,category,price,sale_price,images) values('22222222-2222-4222-8222-222222222222','Test vase','Decor',100,80,array['https://example.com/vase.png']);
insert into public.products(id,name,category,price,images,active) values('33333333-3333-4333-8333-333333333333','Hidden vase','Decor',100,array['https://example.com/vase.png'],false);
set role anon;
do $$begin
 if public.is_owner() then raise exception 'Anon became owner';end if;
 if (select count(*) from public.products)<>1 then raise exception 'Hidden product leaked';end if;
 perform public.place_order('{"name":"Test Customer","email":"test@example.com","phone":"12345678","address":"Test address"}', '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":2,"unit_price":1}]');
 begin perform public.place_order('{"name":"Test","email":"test@example.com","phone":"12345678","address":"Test address"}', '[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":0}]'); raise exception 'Invalid quantity accepted'; exception when others then if sqlerrm='Invalid quantity accepted' then raise;end if;end;
 begin perform public.place_order('{"name":"Test","email":"test@example.com","phone":"12345678","address":"Test address"}', '[{"product_id":"33333333-3333-4333-8333-333333333333","quantity":1}]'); raise exception 'Hidden product accepted';exception when others then if sqlerrm='Hidden product accepted' then raise;end if;end;
 begin perform * from public.orders;raise exception 'Anonymous order data leaked';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('product-images','attack.png');raise exception 'Anon upload accepted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
do $$begin
 if (select total from public.orders limit 1)<>160 then raise exception 'Client price tampering affected total';end if;
 if (select count(*) from public.orders)<>1 then raise exception 'Invalid orders persisted';end if;
 if (select count(*) from public.notification_events)<>1 then raise exception 'Order alert not queued';end if;
end;$$;
set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $$begin
 if (select count(*) from public.orders)<>0 then raise exception 'Non-owner read orders';end if;
 update public.orders set status='delivered';
 if found then raise exception 'Non-owner updated orders';end if;
end;$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin
 if not public.is_owner() then raise exception 'Owner not recognized';end if;
 if (select count(*) from public.orders)<>1 then raise exception 'Owner cannot read order';end if;
 update public.orders set status='confirmed',payment_status='received';
 update public.orders set status='dispatched';
 update public.orders set status='delivered';
 if public.delivered_count()<>1 then raise exception 'Delivered count incorrect';end if;
 insert into storage.objects(bucket_id,name) values('product-images','allowed.png');
end;$$;
reset role;
do $$begin if (select count(*) from public.notification_events)<>5 then raise exception 'Expected order and payment notifications';end if;end;$$;
select 'PASS: authoritative prices, invalid carts, hidden products, anonymous/non-owner isolation, owner order updates, image upload policies, notification queue and delivered count' as result;
