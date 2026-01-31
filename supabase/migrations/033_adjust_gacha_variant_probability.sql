-- Adjust variant (변동) probability.
-- Variant roll probability becomes (rate_sss / 5).

set search_path = nyang, public;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(to_regprocedure('nyang.perform_gacha_draw(text, uuid)')) into v_def;
  if v_def is null then
    raise exception 'perform_gacha_draw not found';
  end if;

  v_def := regexp_replace(
    v_def,
    'v_variant_prob\s*:=\s*[^;]*;',
    'v_variant_prob := greatest(coalesce(v_pool.rate_sss, 0) / 5, 0) / 100;',
    'g'
  );

  execute v_def;
end $$;
