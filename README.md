# קן

רשת חברתית פרטית למשפחה. נכנסים עם Google, פותחים קבוצה (את/ה הבעלים), ומצרפים את המשפחה עם קוד או קישור.

בכל קבוצה:
- **פיד**: פוסטים ותמונות, לייקים ותגובות
- **צ׳אט**: הודעות בזמן אמת
- **אירועים**: ארוחות שישי, ימי הולדת ומפגשים, עם אישור הגעה
- **אלבום**: כל התמונות של הקבוצה במקום אחד
- **חברים**: קוד הזמנה, ובעלי הקבוצה יכולים להוציא חברים, להחליף קוד ולמחוק את הקבוצה

אפליקציית ווב (PWA): מתקינים למסך הבית, נפתחת במסך מלא ומתעדכנת לבד.

## מבנה

- `www/index.html` – כל האפליקציה. בראש הסקריפט נמצא `FIREBASE_CONFIG`.
- `www/sw.js`, `www/manifest.webmanifest`, `www/icons/` – התקנה ועבודה בלי אינטרנט
- `firestore.rules` – כללי האבטחה של מסד הנתונים: רק חברי קבוצה רואים אותה
- `.github/workflows/pages.yml` – מפרסם את `www/` ל-GitHub Pages

## מצב דמו

כש-`FIREBASE_CONFIG` הוא `null`, או כשמוסיפים `?demo` לכתובת, האפליקציה רצה עם משפחה לדוגמה, בלי לשמור כלום.

## חיבור ל-Firebase (פעם אחת)

1. ב-https://console.firebase.google.com יוצרים פרויקט.
2. **Build → Authentication → Sign-in method**: מפעילים את **Google**.
3. **Authentication → Settings → Authorized domains**: מוסיפים את `manorkeshet417-code.github.io`.
4. **Build → Firestore Database → Create database**: בוחרים production mode ואזור באירופה.
5. **Firestore → Rules**: מדביקים את התוכן של `firestore.rules` ולוחצים Publish.
6. **Project settings → Your apps → Web (`</>`)**: רושמים אפליקציה, מעתיקים את `firebaseConfig` ל-`FIREBASE_CONFIG` ב-`www/index.html`.

הערכים ב-`firebaseConfig` אינם סודיים. מי שמגן על הנתונים הם כללי האבטחה.

## תמונות

התמונות מוקטנות בדפדפן (עד 1600 פיקסלים) ונשמרות בתוך Firestore, כי Firebase Storage דורש תוכנית בתשלום. המכסה החינמית של Firestore (1GB) מספיקה לאלפי תמונות.
