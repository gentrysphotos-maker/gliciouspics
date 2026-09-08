# G.licious Pics — Admin Guide & Instruction Manual

This manual is written in plain, non-technical language to help you (Gentry) manage your photography website, add new products, process orders, run tests, and push updates live without needing AI or developer assistance.

---

## Section 1: How to Add New Photos & Products to the Site

Adding new prints to your site is a multi-step process that involves preparing the image files, uploading them to your storage accounts, listing them in your catalog file (`products.json`), and deploying the changes to the web.

### 1. Prepare and Resize the Photo in Lightroom
To ensure the website loads fast for buyers but the print laboratory receives a high-resolution file, you must export two versions of your photo:
1. **The Web Version (for Cloudinary):**
   - Open Lightroom, select your photo, and crop it to the desired aspect ratio (e.g., 2:3 for standard vertical prints, or 1:3 for panoramas).
   - Click **Export**. Set the format to **JPEG**, and change the Color Space to **sRGB** (best for web screens).
   - Set the Quality slider to **70% to 80%** (this keeps the file size small—usually under 1MB—so your web pages load instantly).
   - Check the box to **Resize to Fit** and select **Long Edge**. Set the limit to **2000 pixels**.
   - Under file naming, choose a clean, lowercase, hyphen-separated name matching your planned product ID (e.g., `maui-sunset-wave-print`). Do not use spaces, capital letters, or special characters.
2. **The Print Version (for Cloudflare R2):**
   - In Lightroom, select the same cropped photo and click **Export**.
   - Set the format to **JPEG** (Quality: **100%**) or **TIFF** (uncompressed).
   - Change the Color Space to **Adobe RGB (1998)** or **sRGB** (Prodigi supports both, but Adobe RGB captures richer colors for print).
   - Keep the resolution at full size (do not resize).
   - Name the file exactly matching your product ID (e.g., `maui-sunset-wave-print.jpg`).

---

### 2. Upload the Web Version to Cloudinary
1. Log into your account at [cloudinary.com](https://cloudinary.com).
2. Go to the **Media Library** tab.
3. Open the `gliciouspics` folder, and navigate into the appropriate category folder (e.g., `underwater`, `landscapes`, `flora-fauna`, `nightscapes`, `aerial`, `travel`, or `panoramas`).
4. Drag and drop your web-optimized JPEG here to upload it.
5. *Warning:* If Cloudinary appends random characters (like a random code suffix) to your image file name, go to Cloudinary **Settings** (gear icon) -> **Upload** settings, check your upload preset, and ensure that **Unique filename** is set to `False` and **Use filename** is set to `True`.

---

### 3. Upload the Print-Quality Original to Cloudflare R2
1. Log into your Cloudflare account at [cloudflare.com](https://cloudflare.com).
2. Click on **R2** in the left sidebar menu.
3. Select your print images bucket (e.g., `gliciouspics-print-images`).
4. Drag and drop your high-resolution original file here.
5. Make sure the filename matches your product ID exactly (e.g., `maui-sunset-wave-print.jpg`).

---

### 4. Add the Product to Your Excel Spreadsheet
Keep your tracking spreadsheet updated with a new row. Use these columns:
- **ID:** Unique lowercase, hyphen-separated ID (e.g., `maui-sunset-wave-print`).
- **Title:** The display name of the photo (e.g., `Maui Sunset Wave`).
- **Description:** A short, editorial description of the print.
- **Category:** The category matching the folder name (e.g., `landscapes`).
- **Format:** `standard` or `panorama`.
- **Image 1:** Cloudinary base URL (e.g., `https://res.cloudinary.com/dbqfibadw/image/upload/v1778878188/gliciouspics/landscapes/maui-sunset-wave-print.jpg`).
- **Image 2 (frame mockup):** Cloudinary mockup URL.
- **Image 3 (room mockup):** Cloudinary mockup URL.
- **Image 4 (metal mockup):** Cloudinary mockup URL.
- **Image 5 (extra mockup):** Cloudinary mockup URL.
- **printImageUrl:** Cloudflare R2 public print URL (e.g., `https://pub-f453559629f44da193072bfdba9fd762.r2.dev/maui-sunset-wave-print.jpg`).

---

### 5. Add the Entry to `products.json`
1. Open the file `products.json` (located in your project folder) in a code editor like VS Code or a plain text editor like Notepad.
2. Search for the category section you want to add the product to (`standard`, `panoramas`, or `aerial`).
3. Scroll to the bottom of that category's list of products.
4. Copy an existing product entry block, starting with the opening curly brace `{` and ending with the closing curly brace `}`.
5. Paste it right below the last entry.
6. **Punctuation Check:** Place a comma `,` immediately after the previous product's closing brace `}`, but make sure your new, final product entry does **not** have a trailing comma after its closing brace.
7. Change the text inside the quotes for your new product details:
   - Update `id`, `title`, `category`, `format`, `description`, `startingPrice`, and all the image URLs.
   - Save the file.

---

### 6. Update the Gallery HTML Pages
The website includes an automatic compilation script that reads `products.json` and updates the gallery web pages. 

> [!NOTE]
> The build script automatically **randomizes/shuffles** the order of the photos within each gallery using a deterministic seed (stable between runs). It performs two advanced operations:
> 1. **Resolves Adjacency Conflicts:** Prevents similar photos (e.g. horizontal and vertical versions of the same spot, or items sharing key words in titles/IDs) from appearing next to each other horizontally or vertically.
> 2. **Flows Left-to-Right:** Rearranges the items in the DOM so they display from left-to-right across columns on desktop screens, rather than top-to-bottom.

1. Open the Command Prompt, navigate to the folder, and run:
   `node scripts/build-galleries.js`
   This automatically rebuilds the category HTML files (like `underwater.html`, `landscapes.html`, etc.) to include your new prints.
2. Next, apply structural layouts by running:
   `node scripts/build-layouts.js`
3. Update the search sitemap by running:
   `node scripts/generate-sitemap.js`

> [!WARNING]
> Do not edit gallery HTML pages (like `underwater.html`) manually. If you do, those changes will be completely overwritten and lost the next time the build script runs. Always edit `products.json` and run the build commands instead.

---

### 7. Push Changes Live
Follow the instructions in **Section 4** to upload your changes to GitHub, which automatically updates the live website.

---

## Section 2: How to Manage Stripe Payments

Stripe handles all client checkout sessions securely.

### 1. Log in and Switch Modes
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign in.
2. In the top-right corner, click the **Test Mode** toggle switch to switch between test mode (orange badge) and live mode (real money).

---

### 2. View and Search Transactions
1. In the Stripe sidebar, click on the **Payments** tab.
2. Use the search bar at the top of the dashboard. You can search by customer email, name, transaction reference ID, or card brand.

---

### 3. Issue a Refund
1. Open the specific transaction you wish to refund in the **Payments** list.
2. Click the **Refund** button in the top right (circular arrow icon).
3. Select whether you want a **Full refund** or a **Partial refund** (type the exact dollar amount to refund).
4. Select a reason for the refund from the dropdown menu and add an internal note explaining why.
5. Click **Refund**. It takes 5 to 10 business days for the refund to appear on the customer's bank statement.

---

### 4. Create Discount Coupons & Promo Codes
1. Go to **Product Catalog** -> **Coupons** in the left menu.
2. Click **+ New** to create a Coupon.
3. Configure the discount value (e.g., `10%` off or `$20.00` off) and select duration: **Once**. Click **Create Coupon**.
4. **CRITICAL STEP:** Customers cannot type raw Coupon IDs at checkout. You must create a customer-facing **Promotion Code**:
   - Click on the Coupon you just created to open its details page.
   - In the **Promotion codes** section, click **+ Add a promotion code**.
   - Type the code customers should enter (e.g., `ALOHA10`).
   - Set restrictions if needed (e.g., expiration date, minimum spend, or limit of 1 use per customer).
   - Click **Save**.

---

### 5. Update or Deactivate Promo Codes
1. In the Stripe sidebar, go to **Product Catalog** -> **Coupons** and click on your coupon.
2. Find the code in the **Promotion codes** list.
3. Click the three dots `...` next to the code and click **Deactivate**. Deactivated codes immediately stop working at checkout.

---

### 6. View Payout Schedules
1. Go to **Balances** -> **Payouts** in the Stripe sidebar.
2. This screen displays a list of past payouts and schedules showing exactly when pending funds will arrive in your bank account.
3. By default, Stripe deposits funds on a rolling 2-business-day schedule. Payouts do not process on weekends or bank holidays.

---

### 7. Download Sales Reports for Taxes
1. Go to **Reports** -> **Financial Reports** in the left menu.
2. Under **Balance**, click the **Download** button next to your selected month.
3. Choose the CSV format and select **Download** to save the spreadsheet to your computer.

---

### 8. Handle a Customer Chargeback Dispute
1. If a customer disputes a charge, you will receive an email, and the dispute will appear under **Payments** -> **Disputes**.
2. Stripe will hold the disputed amount plus a $15 fee while the dispute is reviewed.
3. Click **Submit Evidence** inside the dispute.
4. Upload:
   - The tracking number from Prodigi confirming successful delivery.
   - Screenshots of order confirmation emails.
   - Proof of your return/refund policies.
5. Submit the evidence. The cardholder's bank will review it and make a final decision within 60–75 days.

---

## Section 3: How to Test the Site

Testing ensures that payments, automated printing (Prodigi), and emails (Resend) are working properly without spending real money.

### 1. Set Up Stripe Test Mode
1. In the Stripe dashboard, toggle **Test Mode** on.
2. Ensure your local `.env` configuration file contains your Stripe test keys (they start with `sk_test_` and `pk_test_`).

---

### 2. Complete a Successful Test Purchase
1. Go to your staging/test website, add a print to your cart, and click Checkout.
2. On the secure Stripe page, fill in details using a test email.
3. In the Card Number field, type the test number: **`4242 4242 4242 4242`**.
4. Enter any future expiration date (e.g., `12 / 29`) and any 3-digit CVC code (e.g., `123`).
5. Click **Pay**. You should be redirected back to the website's success confirmation page.

---

### 3. Test a Declined Payment
1. Run through checkout again.
2. In the Card Number field, use: **`4000 0000 0000 0002`** (Stripe's card configured to trigger a decline).
3. Enter any future date and CVC.
4. Click **Pay**. Verify that the page blocks the purchase and shows a clear card-declined message.

---

### 4. Test a Staging Discount Code
1. Start checkout and type your test promotion code (e.g., `TEST10`) in the discount code box.
2. Verify that the order total drops by the correct amount before clicking pay.

---

### 5. Verify the Webhook Fired in Stripe
1. Go to Stripe dashboard -> **Developers** -> **Webhooks**.
2. Click on your webhook endpoint.
3. Look at the list of recent events. Verify that the `checkout.session.completed` event is marked with a green checkmark and a **`200 OK`** success code.

---

### 6. Verify the Sandbox Print Order in Prodigi
1. Log into your Prodigi Sandbox dashboard at [sandbox-beta-dashboard.pwinty.com](https://sandbox-beta-dashboard.pwinty.com).
2. Go to the **Orders** tab.
3. Find your test purchase. Verify that the correct SKU, quantity, customer address, and Cloudflare R2 print URL are shown.

---

### 7. Verify Confirmation Emails
1. If testing locally, open the `temp_emails/` folder in your project folder. The site writes outgoing emails as HTML files on your hard drive so you can double-click and open them in a browser to inspect.
2. If testing in staging/preview mode, log into [resend.com](https://resend.com) and check the **Logs** tab to see that the email was successfully sent.

---

### 8. Troubleshooting: paid, but no email and/or no print order

This is the most important failure to be able to diagnose, so work through it in
this order. Each step tells you which half of the system to look at next.

**Step 0 — is the listener alive at all?** One command, no dashboard needed:

```bash
curl -X POST https://gliciouspics.com/api/webhooks/stripe -H 'Content-Type: application/json' -d '{}'
```

`Webhook Error: No stripe-signature header value was provided.` (HTTP 400) means
the listener is healthy — an unsigned probe is supposed to be rejected. Anything
else, especially a 404, means Stripe has nowhere to deliver to. `npm run preflight`
runs this same probe against whatever URL is actually registered in Stripe.

**Step 1 — did the webhook even arrive?** Stripe Dashboard → **make sure you are
in the same mode as the payment** → Developers → Webhooks → your endpoint →
Recent events.

| What you see | What it means | Fix |
|---|---|---|
| No endpoint at all, or no event listed | Stripe never called us. Almost always a missing **live-mode** endpoint (see checklist step 2a). | Create the endpoint, then use **Resend** on the event to fulfill the order that was missed. |
| `404` with `"message": "Application not found"` | That is **Railway's edge answering, not your app** — the hostname in the endpoint URL no longer resolves to a running service. Your code never saw the request. Usually a stale `*.up.railway.app` subdomain. | Edit the endpoint URL to your **custom domain**: `https://gliciouspics.com/api/webhooks/stripe`. Do not use a `*.up.railway.app` subdomain — those can be regenerated or retired, and Railway routes by Host header, so only the domain actually attached to the service answers. |
| `404` (any other body) | The host is up but nothing serves that path — usually the retired Netlify function path. | Same fix: point it at `https://gliciouspics.com/api/webhooks/stripe`. |
| `400` | Signature rejected — `STRIPE_WEBHOOK_SECRET` is from the wrong endpoint or the wrong mode. | Paste the correct signing secret, then **Resend** the event. |
| `500` | We received it but a step failed. | Go to step 2. The response body names the failed stage. |
| `200` | Fulfillment completed. | Go to step 3. |

**Step 2 — read the Railway logs** for that order. Search for the order ref
(`GLP-...`) or `[FULFILLMENT_ALERT]`. Every stage logs its own outcome, so the
log names exactly which one failed and why. `[ORDER_RECORD]` lines contain the
complete order as JSON, so nothing is lost even when every downstream step fails.

**Step 3 — emails.** Resend → **Domains**: `gliciouspics.com` must read
**Verified**. An unverified domain returns `403` on *every* send, so neither you
nor the customer receives anything. Then check the **Logs** tab for the send.

**Step 4 — Prodigi.** Prodigi's order API is synchronous: an accepted order
appears in the dashboard immediately, so there is no waiting period to sit
through. If it is not in the **live** dashboard, check the **sandbox** dashboard
at [sandbox-beta-dashboard.pwinty.com](https://sandbox-beta-dashboard.pwinty.com) —
a live order landing in the sandbox means `PRODIGI_API_URL` is still set to the
sandbox URL.

**Other things worth checking**
- [ ] **Run `npm run preflight`** with the production environment variables. It checks steps 1, 3 and 4 in one command.
- [ ] **Check `/api/health`** on the live site — it reports any missing configuration without exposing secret values.
- [ ] **Check printImageUrl:** paste a `printImageUrl` from `products.json` into a browser. If the image does not load, your bucket settings are blocking access and Prodigi cannot fetch the print file.

#### What happens automatically when a step fails

You do not have to catch every one of these by hand:

- The **customer confirmation is sent before** Prodigi is contacted, so a print-lab outage can never leave a customer with no confirmation.
- Each stage is independent — one failure no longer cancels the others.
- Failed stages return a non-`2xx` to Stripe, so Stripe **retries the delivery** for up to 3 days and emails you about the failing endpoint.
- Completed stages are recorded in the payment's metadata, so a retry **never places a second print order or sends a duplicate confirmation**. You can see this state in Stripe on the payment itself (`glp_prodigi_order_id`, `glp_customer_email_at`, `glp_admin_email_at`).
- Set `ALERT_WEBHOOK_URL` to a Slack or Discord webhook to be notified out-of-band — that path does not depend on email working.

---

## Section 4: How to Push Code Changes to the Live Site

Follow these steps to deploy bug fixes, updates, or catalog additions from your computer to the live website.

### 1. Open the Command Prompt
1. Click the Windows Start menu, type `cmd`, and press Enter.
2. Navigate to your project folder:
   `cd C:\Users\skate\OneDrive\Desktop\gliciouspics-website-claude`
   and press Enter.

---

### 2. Compile Your Pages
If you modified `products.json`, compile your changes first:
1. Run `node scripts/build-galleries.js` (generates the gallery HTML files).
2. Run `node scripts/build-layouts.js` (rebuilds the overall structural templates).
3. Run `node scripts/generate-sitemap.js` (updates search engine listings).

---

### 3. Upload to the Preview Staging Environment
1. Stage all your changed files for upload:
   `git add .`
2. Commit the changes with a short description:
   `git commit -m "Added summer landscape prints"`
3. Push the changes to GitHub under the preview branch:
   `git push origin preview`
4. Log into your Railway dashboard (railway.app) and verify that the preview branch builds successfully. Test your changes on the preview URL.

---

### 4. Deploy Live to Production
Once you verify that everything works correctly on the preview site, deploy it to your live audience:
1. Switch to your production branch:
   `git checkout production`
2. Merge the tested preview branch changes:
   `git merge preview`
3. Push to your live repository:
   `git push origin production`
4. Railway will automatically detect the push and deploy the update to your live domain.
5. Switch your local console back to the preview branch so you don't edit production files directly next time:
   `git checkout preview`

---

### 5. Roll Back a Bad Deployment
If you deploy an update that breaks the live site:
1. In the Command Prompt inside your folder, check your recent changes:
   `git log --oneline`
2. Revert the last update:
   `git revert HEAD`
3. Save the commit message and push the reverted code:
   `git push origin production`
   Railway will immediately compile and restore the previous working version.

---

## Section 5: How to Manage Prodigi Print Orders

Prodigi processes, prints, and ships your orders automatically.

### 1. Check Order Status
1. Log into your Prodigi Dashboard (dashboard.prodigi.com for live orders; [sandbox-beta-dashboard.pwinty.com](https://sandbox-beta-dashboard.pwinty.com) for test orders).
2. Click the **Orders** tab to search by name or reference ID.
3. Monitor the order status:
   - **Created:** Order submitted to Prodigi.
   - **Validated:** Passed automatic checks, scheduled for print.
   - **In Production:** Currently being printed and prepared for shipping.
   - **Shipped:** Sent out. Tracking links will appear on the order card.

---

### 2. Manually Place an Order
If automated fulfillment fails (e.g., if a customer entered an invalid shipping address, or if a payment went through but the file transfer to Prodigi failed):
1. In the Prodigi dashboard, click **Create Order**.
2. Enter the customer's name, email, phone, and shipping address.
3. Under **Items**, click **Add Item**.
4. Choose the print style (Chromaluxe Metal, Lustre, or Matte) and sizing, and enter the correct SKU.
5. Click **Upload Image** and select your high-resolution original file (or input the R2 URL).
6. Select the shipping carrier rate and click **Submit Order**. Pay via credit card to initiate printing.

---

### 3. Update Shipping Addresses
1. Open the order in the Prodigi dashboard.
2. If the status is still **Created** or **Validated**, click the **Edit Address** button to make corrections.
3. *Note:* If the status is already **In Production**, the print lab has started work, and the address cannot be updated. You must contact Prodigi support immediately to request manual redirection.

---

### 4. Replace a Damaged Order
If a customer complains that a print arrived damaged:
1. Ask them to email you a photo of the damaged print and the shipping box.
2. Go to your Prodigi Dashboard, open the order, and click **Report Issue**.
3. Fill out the report and upload the photo evidence. Prodigi will print and ship a replacement at no cost.

---

### 5. Switch Prodigi to Live Production
1. Obtain your production API key from your live Prodigi dashboard.
2. Open your hosting configuration (Railway) and replace `PRODIGI_API_KEY` with the live production key.
3. Set the `PRODIGI_API_URL` environment variable to `https://api.prodigi.com/v4.0`.

---

## Section 6: How to Switch from Test Mode to Live Mode (Launch Checklist)

Follow this checklist when you are ready to launch and accept real payments.

- [ ] **1. Toggle Stripe Live Mode:** In your Stripe dashboard, toggle Test Mode off. Copy the live publishable key (`pk_live_...`) and secret key (`sk_live_...`).
- [ ] **2. Update Environment Variables:** Replace your test keys with live keys in Railway (which serves both the site and the API).
- [ ] **2a. Create the LIVE webhook endpoint — DO NOT SKIP.** Stripe webhook endpoints and their signing secrets are **per-mode**. The endpoint you tested in test mode *does not exist* in live mode. With Test Mode still toggled **off**, go to **Developers → Webhooks → Add endpoint**, set the URL to `https://gliciouspics.com/api/webhooks/stripe`, subscribe to `checkout.session.completed`, then copy that endpoint's **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` on Railway.
      *Skipping this is silent and expensive:* checkout works, the card is charged, Stripe emails its own receipt — and no confirmation email is ever sent and no order ever reaches Prodigi.
- [ ] **2b. Run the preflight:** with the live environment variables loaded, run `npm run preflight`. It verifies that a webhook endpoint exists in the same Stripe mode as your key, that your Resend sending domain is actually verified, and that Prodigi is pointed at the matching environment. It exits non-zero if a real order would fail.
- [ ] **3. Connect Bank Account:** In Stripe, go to **Settings** -> **External Bank Accounts** to configure your bank deposit details.
- [ ] **4. Switch Prodigi URL:** In Railway environment variables, switch `PRODIGI_API_URL` to `https://api.prodigi.com/v4.0` and paste your live Prodigi API key into `PRODIGI_API_KEY`.
- [ ] **5. Verify Resend Domain:** Log into [resend.com](https://resend.com) -> **Domains**, click **Add Domain**, and input `gliciouspics.com`. Add the DNS records provided by Resend to your Spaceship account settings.
- [ ] **6. Update Email Addresses:** Confirm your Domain Verification in Resend is active. Order emails send from `orders@gliciouspics.com` (override with `RESEND_FROM_EMAIL` if needed). Set `OWNER_EMAIL` on Railway for admin order alerts.
- [ ] **7. Domain Name Transfer:** Log into Wix, unlock `gliciouspics.com`, and get your transfer code. Go to Spaceship (spaceship.com), click **Transfer Domain**, paste the code, and complete the check out. Point the domain's DNS settings (A/CNAME records) to Railway.
- [ ] **8. Run a Real Live Test:** Go to your live site, purchase a print using a real credit card. Verify **all four** of these, in order — a success in one does not imply the next:
      1. Payment shows in the Stripe dashboard.
      2. The webhook delivery shows **200 OK** under Developers → Webhooks → your endpoint.
      3. Both order emails arrive (yours and the customer's), and appear in the Resend **Logs** tab.
      4. The order appears in the **live** Prodigi dashboard at `dashboard.prodigi.com`.
      Then refund yourself from the Stripe dashboard. (Refunding does **not** cancel the Prodigi order — cancel that separately in the Prodigi dashboard while it is still `Created`, or you will be billed for a print.)
- [ ] **9. Cancel Wix Subscription:** Cancel Wix billing only after confirming your new site is active and your domain name has transferred successfully to Spaceship.

---

## Section 7: Cloudflare R2 Image Management

Cloudflare R2 hosts your high-resolution original images so Prodigi can fetch them for printing.

### 1. Log In and View Files
1. Sign in to your account at [cloudflare.com](https://cloudflare.com).
2. Click **R2** in the left sidebar.
3. Click on your print images bucket (e.g., `gliciouspics-print-images`).

---

### 2. Upload New Print Originals
1. Open the bucket and click **Upload**.
2. Select your high-quality TIFF or JPEG.
3. **CRITICAL NAMING RULE:** The filename must match your product ID in `products.json` exactly. For example, if your product ID is `peeking-gecko-pano`, the filename must be `peeking-gecko-pano.jpg`. Do not use capital letters, spaces, or symbols.

---

### 3. Verify Public Access
1. Click on the uploaded file in your R2 bucket list.
2. Copy the public link URL (e.g., `https://pub-f453559629f44da193072bfdba9fd762.r2.dev/peeking-gecko-pano.jpg`).
3. Paste it in a new browser tab. The print image must load fully without error or login prompts.

---

### 4. Delete or Overwrite Files
1. To replace a print file, upload a new version with the exact same filename. The new file will overwrite the old one automatically.
2. To delete a file, check the box next to the image in the list and click **Delete**.

---

## Section 8: Cloudinary Web Image Management

Cloudinary optimized images keep your website loading quickly.

### 1. Log In and Organize Files
1. Log into your account at [cloudinary.com](https://cloudinary.com).
2. Go to the **Media Library** tab.
3. Open the `gliciouspics` folder. Organize files by placing them into the correct category folders (e.g., `gliciouspics/underwater`).

---

### 2. Upload Settings
1. Click the gear icon (**Settings**) in the bottom-left corner and go to **Upload**.
2. Look at your active upload preset.
3. Ensure **Unique filename** is set to `False` and **Use filename** is set to `True` so Cloudinary does not append random code suffixes to your files.

---

### 3. Copy Web Image URLs
1. In the Media Library, hover over your uploaded image and click the link icon to copy its URL.
2. Clean the URL so that the website's dynamic resizing parameter scripts work properly:
   - The URL must match the format:
     `https://res.cloudinary.com/[cloud-name]/image/upload/v[version]/gliciouspics/[category]/[filename].jpg`
   - Paste this clean URL as `images.hero` in your `products.json` file.
