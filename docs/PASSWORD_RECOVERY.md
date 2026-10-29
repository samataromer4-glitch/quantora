# Dib-u-dejinta erayga sirta ah

## Diyaarinta production-ka

1. Supabase Dashboard ka fur **SQL Editor** oo kaliya ku orod su'aalaha akhris-keliya ee hoose marka hore. Faylka `supabase/migrations/20261029090000_secure_password_recovery.sql` lama dabaqin database-ka ku xiran hawshan. Ha ku celin ama ha dabaqin migration-ka sababta oo keliya ah in qaar ka mid ah walxuhu maqan yihiin; xaalad qayb ahaan jirta waxay u baahan tahay baaritaan iyo isbarbardhig qeexitaannada ka hor tallaabo kasta.
2. Backend-ku waa inuu isticmaalaa `SUPABASE_URL` iyo `SUPABASE_SECRET_KEY` ama `SUPABASE_SERVICE_ROLE_KEY`. Recovery-gu ma isticmaalo anon/publishable key. Furayaasha sirta ah ha gelin browser ama native/mobile build.
3. `APP_URL` waa inuu noqdaa URL-ka rasmiga ah ee app-ka oo email-qaatahu gaari karo; production-ku wuxuu u baahan yahay `https://`. `localhost` wuxuu ku habboon yahay tijaabada deegaanka, balse email dibadda loo diro kama gaari karo. Recovery link lagama dhiso `Host` header-ka codsiga.
4. `SESSION_SECRET` waa inuu noqdaa qiime dheer oo random ah, kana duwan tusaalooyinka. SMTP-ga ikhtiyaariga ah wuxuu aqbalaa `SMTP_USER`/`SMTP_PASS` ama aliases-ka `EMAIL_USER`/`EMAIL_PASS`; `SMTP_HOST`, `SMTP_PORT`, iyo `SMTP_FROM` waa la dejin karaa. Haddii `SMTP_FROM` la waayo, sender-ku wuxuu ka qaataa cinwaanka SMTP account-ka. Sender-ku waa inuu noqdaa cinwaan email oo sax ah oo provider-ku oggol yahay. SMTP la'aan ama diris fashilantay macnaheedu waa email lama dirin, token-kana waa la tirtiraa.
5. `.env.example` waxa ku jira placeholders oo keliya. Ku hay credentials-ka dhabta ah `.env` maxalli ah oo Git-ku iska indho-tiro ama server secret manager; ha ku darin output, log, ama source control. Diris dhab ah oo SMTP ah laguma tijaabin hawshan.

Su'aalahan ku orod Dashboard SQL Editor si akhris-keliya ah. Waxba kama beddelaan schema ama xogta:

```sql
-- 1. Hubi migration tracking table; haddii uu jiro, kadib hubi diiwaanka migration-ka.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_table;
-- Orod tan kaliya haddii su'aasha kore soo celiso magaca table-ka:
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20261029090000';

-- 2. Isbarbar dhig columns-ka recovery iyo schema-ga users/teachers ee jira.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('dugsiga_users', 'dugsiga_teachers', 'dugsiga_password_recovery_tokens')
ORDER BY table_name, ordinal_position;

-- 3. Xaaladda RLS, owner-ka, iyo object-ka recovery-ga.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'dugsiga_password_recovery_tokens';

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'dugsiga_password_recovery_tokens';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'dugsiga_password_recovery_tokens'
ORDER BY grantee, privilege_type;

-- 4. Constraints iyo indexes, oo ay ku jiraan token uniqueness iyo expiry.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.dugsiga_password_recovery_tokens')
ORDER BY conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'dugsiga_password_recovery_tokens'
ORDER BY indexname;

-- 5. Sequence-ka identity-ga iyo grants-kiisa.
SELECT c.relname, c.relkind, c.relacl,
       has_sequence_privilege('service_role', c.oid, 'USAGE') AS service_role_can_use,
       has_sequence_privilege('service_role', c.oid, 'SELECT') AS service_role_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'dugsiga_password_recovery_tokens_id_seq';

-- 6. Qeexitaannada, security mode, search_path, owner, iyo grants-ka dhammaan RPC-yada/helper-ka.
SELECT p.oid::regprocedure AS function_signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS grants,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'dugsiga_password_recovery_account_is_active',
    'dugsiga_create_password_recovery',
    'dugsiga_validate_password_recovery',
    'dugsiga_consume_password_recovery',
    'dugsiga_delete_password_recovery'
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- 7. Marka columns-ka kor lagu xaqiijiyo, tirakoob aan soo bandhigayn email ama xog qofeed.
SELECT COUNT(*) AS user_count,
       COUNT(*) FILTER (WHERE session_version IS NULL) AS null_session_version_count,
       COUNT(*) FILTER (WHERE verified IS FALSE) AS explicitly_unverified_count
FROM public.dugsiga_users;
```

U adeegso natiijooyinka si aad u barbar dhigto dhammaan qeexitaannada migration-ka: columns iyo types-ka `dugsiga_users`/`dugsiga_teachers`, table, RLS/grants, sequence, indexes, constraints, dhammaan shanta function iyo signatures-kooda, owners, `search_path`, definitions, grants, expiry, atomic consumption, iyo session version. Haddii query uu fashilmo sababtoo ah object maqan yahay, ama qayb keliya la helay, hakad geli; ha ku celin migration-ka. Natiijada remote-ka lama xaqiijin karo gudaha workspace-kan.

Manual-ka hadda: fur Dashboard-ka mashruuca saxda ah, gal **SQL Editor**, hubi project-ka la doortay, kadib kaliya orod su'aalaha akhris-keliya ee kore. Ha riixin **Run** adigoo ku jira faylka migration-ka. Marka schema-ga iyo migration history-ga la isbarbar dhigo, DBA/maamulaha mashruuca ha go'aamiyo tallaabada xigta; migration, reset, iyo database push hawshan laguma samayn.

## Habka amniga iyo xogta

- Token-ku waa 256-bit random; database-ku wuxuu hayaa oo keliya SHA-256 hash-kiisa. Token-ka link-ga waxaa lagu diraa URL fragment si uusan ugu muuqan HTTP request-ka ama server access logs-ka.
- Token-ku wuxuu dhacayaa 20 daqiiqo gudahood. RPC-ga database-ku wuxuu isku transaction ku xaqiijiyaa tenant-ka/role-ka/aqoonsiga macallinka, cusboonaysiiyaa password-ka, calaamadiyaa token-ka iyo kuwii kale ee akoonkaas, wuxuuna kordhiyaa `session_version`.
- API requests-ka la xaqiijiyey waxay la barbar dhigaan nooca session-ka database-ka. Markii erayga sirta ah la beddelo, sessions-kii hore waa la diidayaa; qofku waa inuu mar kale galaa.
- Haddii email-ku maqan yahay ama akoonku aanu firfircoonayn, jawaabta codsiga dib-u-dejintu lama kala saaro. Khaladaadka DB/email-ku ma muujiyaan in email-ku diiwaangashan yahay, mana qoraan token ama password logs-ka.
- Habka JSON-ka maxalliga ah ee development-ku wuxuu isticmaalaa qorid ku-meel-gaar ah oo atomic ah iyo lock gudaha process-ka. Production-ku waa inuu isticmaalaa Supabase; server-ku ma oggola local fallback marka uu production yahay, wuxuuna si cad u diidaa codsiga haddii database-ka maqan yahay.
- Xaddidaadaha codsiyada ee hadda jira waxay ku jiraan xusuusta process-ka; waxay xaddidaan IP, email iyo token isku server ah, balse ma aha xaddidaad wadaag ah oo u dhexeeya server instances badan. Deegaan instances badan leh waa inuu intaa ku daraa rate limit wadaag ah oo ka socda edge/proxy ama kayd dhexe.

## Diiwaangelin iyo xaqiijinta email-ka

Code-ka hadda jira si ula kac ah ayuu u abuuraa akoonka maamulka isagoo `verified: true` ah, mana laha nidaam cad oo email looga xaqiijiyo diiwaangelinta. UI-gu wuxuu muujinayaa in akoonka la sameeyay; ma sheegayo in email la xaqiijiyay. Endpoint-kii `/api/auth/verify` wuxuu hadda ku jawaabaa `410` oo ma sheegayo guul marka aan la hayn caddeyn. Sidaas darteed `verified` ee diiwaangelinta hadda ma caddaynayo lahaanshaha email-ka. Diiwaangelin aan email la xaqiijin waxay qof u oggolaan kartaa inuu akoon maamul ku sameysto cinwaan dugsi oo uusan lahayn; tani waa khatar isku-ekaysiin/claim-gareyn tenant oo weli u baahan go'aan product iyo email-proof flow ka hor production.

Naqshadda ugu yar ee la jaanqaadi karta haddii xaqiijin email la ansixiyo: ku dar jadwal token oo keliya hash-keeda kaydiya, ku xiro email-ka/aqoonsiga akoonka iyo tenant-ka, token random ah oo hal-mar ahna ha dhaco waqti kooban; dir link Somali ah adigoo adeegsanaya SMTP-ga jira; xaqiijintu hal transaction ha ku calaamadiso token-ka iyo akoonka, login-kuna ha diido oo keliya akoon cusub oo aan wali xaqiijin. Teachers-ku ha sii maraan casuumaad/dhaqaajin u gaar ah. Xogta iyo akoonnada hore waa in loo qaataa sidii hore, iyadoo aan si aamusan loogu beddelin unverified ama loo xannibin; migration gaar ah waa in la diyaariyo lana eego ka hor intaan remote loo dabaqin.

## Xaqiijin

Rate limiter-ku wuxuu ku shaqeeyaa hal process oo local ah; marka la adeegsado server instances badan, waa in la qorsheeyo xadeyn wadaag ah oo edge/proxy ama kayd dhexe ah. Orod `npm run test:password-recovery`, `npm run test:auth-cloud-contract`, `npm run lint`, iyo `npm run build`. Tijaabooyinka source/functional-ka ma beddelayaan xaqiijinta migration-ka database dhab ah ama SMTP-ga deegaanka production-ka.
