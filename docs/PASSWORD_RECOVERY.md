# Dib-u-dejinta erayga sirta ah

## Diyaarinta production-ka

1. Supabase Dashboard ka fur **SQL Editor** oo marka hore orod su'aalaha xaqiijinta ee hoose. Haddii walxaha oo dhan jiraan, dib ha u orodin migration-ka. Haddii ay maqan yihiin, ku dheji dhammaan `supabase/migrations/20261029090000_secure_password_recovery.sql` oo orod hal mar. Haddii qayb keliya jirto, marka hore baar xaaladda schema-ga; ha ku celin migration-ka adigoon hubin. Migration-ku ma tirtirayo xog; wuxuu abuuraa jadwalka recovery-ga, xannibaadaha RLS, RPC-yada atomiga ah, iyo `session_version`. Ha isticmaalin database reset ama migration push si toos ah.
2. Hubi in backend-ku isticmaalo `SUPABASE_SECRET_KEY` ama `SUPABASE_SERVICE_ROLE_KEY`. Recovery-gu ma isticmaalo anon/publishable key.
3. Deji `APP_URL` inuu noqdo URL-ka rasmiga ah ee app-ka oo email-qaatahu gaari karo; production-ku wuxuu u baahan yahay `https://`. Ha u adeegsan `localhost` link email oo qof kale loo dirayo. Recovery link lagama dhiso `Host` header-ka codsiga.
4. Haddii email la diri doono, deji SMTP-ga hadda jira: `SMTP_USER` iyo `SMTP_PASS` (ama `EMAIL_USER` iyo `EMAIL_PASS`), iyo ikhtiyaar ahaan `SMTP_HOST`, `SMTP_PORT`, iyo `SMTP_FROM`. Adeeggu wuxuu default u adeegsadaa `smtp.gmail.com:587`; sender-ku default ayuu ka qaataa `SMTP_USER`. Haddii SMTP aan la dejin, email lama diro, token-kana waa la tirtiraa.
5. Hubi in provider-ka email-ku oggol yahay dirista `SMTP_FROM`, in `APP_URL` laga geli karo email-ka, iyo in server-ku ku xirmi karo Supabase ka hor inta aan la furin isticmaalayaasha.

SQL Editor-ka ku xaqiiji waxyaabahan akhris-keliya ka hor iyo ka dib migration-ka:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dugsiga_users'
  AND column_name = 'session_version';

SELECT to_regclass('public.dugsiga_password_recovery_tokens') AS recovery_table;

SELECT to_regprocedure('public.dugsiga_consume_password_recovery(text,text)') AS consume_function;
```

Waa in la helo hal saf oo `session_version` ah, iyo qiimayaal aan `NULL` ahayn labada su'aalood ee kale.

## Habka amniga iyo xogta

- Token-ku waa 256-bit random; database-ku wuxuu hayaa oo keliya SHA-256 hash-kiisa. Token-ka link-ga waxaa lagu diraa URL fragment si uusan ugu muuqan HTTP request-ka ama server access logs-ka.
- Token-ku wuxuu dhacayaa 20 daqiiqo gudahood. RPC-ga database-ku wuxuu isku transaction ku xaqiijiyaa tenant-ka/role-ka/aqoonsiga macallinka, cusboonaysiiyaa password-ka, calaamadiyaa token-ka iyo kuwii kale ee akoonkaas, wuxuuna kordhiyaa `session_version`.
- API requests-ka la xaqiijiyey waxay la barbar dhigaan nooca session-ka database-ka. Markii erayga sirta ah la beddelo, sessions-kii hore waa la diidayaa; qofku waa inuu mar kale galaa.
- Haddii email-ku maqan yahay ama akoonku aanu firfircoonayn, jawaabta codsiga dib-u-dejintu lama kala saaro. Khaladaadka DB/email-ku ma muujiyaan in email-ku diiwaangashan yahay, mana qoraan token ama password logs-ka.
- Habka JSON-ka maxalliga ah ee development-ku wuxuu isticmaalaa qorid ku-meel-gaar ah oo atomic ah iyo lock gudaha process-ka. Production-ku waa inuu isticmaalaa Supabase; server-ku ma oggola local fallback marka uu production yahay, wuxuuna si cad u diidaa codsiga haddii database-ka maqan yahay.
- Xaddidaadaha codsiyada ee hadda jira waxay ku jiraan xusuusta process-ka; waxay xaddidaan IP, email iyo token isku server ah, balse ma aha xaddidaad wadaag ah oo u dhexeeya server instances badan. Deegaan instances badan leh waa inuu intaa ku daraa rate limit wadaag ah oo ka socda edge/proxy ama kayd dhexe.

## Xaqiijin

Orod `npm run test:password-recovery`, `npm run test:auth-cloud-contract`, `npm run lint`, iyo `npm run build`. Tijaabooyinka source/functional-ka ma beddelayaan xaqiijinta migration-ka database dhab ah iyo SMTP-ga deegaanka production-ka.
