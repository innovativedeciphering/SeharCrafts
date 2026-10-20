import { passwordError, authRedirect, createRecoveryStore } from "./auth.js";
import QRCode from "qrcode";
import {
  paymentFields,
  paymentLabels,
  paymentMethods,
  paymentPageUrl,
} from "./payments.js";
import { createClient } from "@supabase/supabase-js";
import { demoProducts, sampleImage } from "./demo.js";
import { priceOf, totalOf, escapeHtml as e, safeImage } from "./domain.js";
import "./style.css";
const recoveryReturn =
  new URLSearchParams(location.search).get("auth") === "recovery" ||
  new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
const db = configured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )
  : null;
const state = {
  products: configured ? [] : demoProducts,
  cart: [],
  filter: "All",
  settings: {
    store_name: "Sehar Crafts",
    currency: "PKR",
    payment_details:
      "Payment instructions will be supplied after the owner confirms your order.",
    delivery_note:
      "Delivery charges are confirmed by the owner before payment.",
  },
  orders: [],
  testimonials: [],
  delivered: 0,
  ownerSettings: {},
  passwordRecovery: false,
  recoveryReturnHandled: false,
  storeLoaded: false,
  owner: false,
  displayCurrency: "PKR",
};
const recoveryStore = createRecoveryStore({
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
});
let recoveryRecording = Promise.resolve();
if (db)
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
      state.passwordRecovery = true;
      recoveryRecording = recoveryStore.remember(session);
      // Schedule outside the Auth callback to avoid awaiting Auth while its lock is held.
      setTimeout(() => {
        recoveryRecording
          .then(() => {
            location.hash = "/reset-password";
            return route();
          })
          .catch((err) => toast(err.message));
      }, 0);
    } else if (event === "SIGNED_OUT") {
      state.passwordRecovery = false;
      recoveryStore.clear();
    }
  });
const app = document.querySelector("#app");
const money = (value) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: state.displayCurrency,
    maximumFractionDigits: state.displayCurrency === "USD" ? 2 : 0,
  }).format(
    state.displayCurrency === "USD" ? value / state.settings.usd_rate : value,
  );
const img = (url, alt, cls = "") =>
  `<img class="${cls}" src="${e(safeImage(url))}" alt="${e(alt)}" loading="lazy" onerror="this.style.display='none'">`;
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => (node.hidden = true), 6000);
}
function shell() {
  app.innerHTML = `<div class="announcement">Thoughtfully made. Beautifully yours. <span>Handcrafted with love in every detail</span></div><header><a class="brand" href="#/">sehar<span>CRAFTS & LITTLE JOYS</span></a><nav><a href="#/">Shop collection</a><a href="#story">Our story</a><a href="#/track">Track order</a><a href="#/owner">Owner studio</a><select id="display-currency" aria-label="Display currency"><option>PKR</option><option value="USD" ${state.settings.usd_rate ? "" : "disabled"}>USD estimate</option></select></nav><div id="header-social-links" class="social-links" aria-label="Social media profiles"></div></header><main id="view"></main><footer><a class="brand" href="#/">sehar<span>MADE BY HAND, KEPT BY HEART.</span></a><p>Handcrafts, home accents & thoughtful gifts.</p><div id="social-links" class="social-links" aria-label="Social media profiles"></div><a href="${import.meta.env.BASE_URL}privacy.html">Privacy policy</a><a href="${import.meta.env.BASE_URL}terms.html">Terms of service</a><a href="#/owner">Owner studio ↗</a><small>© ${new Date().getFullYear()} Sehar Crafts</small></footer><button class="bag floating-bag" id="cart" aria-label="Open bag, 0 items" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>Bag <span id="count" aria-live="polite">${state.cart.reduce((s, i) => s + i.quantity, 0)}</span></button><button id="chat-open" class="chat-open">✧ Ask Sehar</button><section id="chat" class="chat" hidden><div class="chat-title">Your shopping companion <button id="chat-close" aria-label="Close assistant">×</button></div><p class="muted">Automated store guide · not a live person or AI model</p><div id="chat-log" aria-live="polite"><p>Hello! I can help with products, prices, ordering, delivery, and payment.</p></div><form id="chat-form"><input name="message" aria-label="Message" placeholder="Ask about our collection…" required maxlength="500"><button>Send</button></form></section><dialog id="modal"></dialog><div id="toast" role="status" hidden></div>`;
  document.querySelector("#cart").onclick = showCart;
  document.querySelector("#display-currency").onchange = (ev) => {
    state.displayCurrency = ev.target.value;
    route().catch((err) => toast(err.message));
  };
  document.querySelector("#chat-open").onclick = () =>
    (document.querySelector("#chat").hidden = false);
  document.querySelector("#chat-close").onclick = () =>
    (document.querySelector("#chat").hidden = true);
  document.querySelector("#chat-form").onsubmit = (event) => {
    event.preventDefault();
    const input = event.target.elements.message;
    const q = input.value;
    const lower = q.toLowerCase();
    let answer =
      "Browse the collection and select a product to see its photos and price. Add your favourites to the bag, then send an order request.";
    if (/pay|bank|transfer/.test(lower))
      answer = state.settings.payment_details;
    if (/deliver|ship/.test(lower)) answer = state.settings.delivery_note;
    if (/price|cost|cheap/.test(lower))
      answer =
        state.products
          .map((p) => `${p.name}: ${money(priceOf(p))}`)
          .join(" · ") || "The owner is preparing the collection.";
    if (/order|status|refund|return/.test(lower))
      answer =
        "After placing an order, keep your order number. Confirmation and payment checks are handled by the owner. Never send card details in chat.";
    const log = document.querySelector("#chat-log");
    log.insertAdjacentHTML(
      "beforeend",
      `<p class="user-msg">${e(q)}</p><p>${e(answer)}</p>`,
    );
    input.value = "";
    log.scrollTop = log.scrollHeight;
  };
}
function updateBagCount() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelector("#count").textContent = count;
  document.querySelector("#cart").setAttribute("aria-label", `Open bag, ${count} ${count === 1 ? "item" : "items"}`);
}
function renderSocials() {
  const links = [
    "instagram",
    "facebook",
    "tiktok",
  ]
    .map((name) => {
      const url = state.settings[name + "_url"];
      return url && safeImage(url)
        ? `<a href="${e(safeImage(url))}" target="_blank" rel="noopener noreferrer" class="social-icon social-${name}" aria-label="Sehar Crafts on ${name[0].toUpperCase() + name.slice(1)}" title="${name[0].toUpperCase() + name.slice(1)}"><img src="${import.meta.env.BASE_URL}social/${name}.svg" alt="" width="24" height="24"></a>`
        : "";
    })
    .join(" ");
  document.querySelectorAll(".social-links").forEach((container) => {
    container.innerHTML = links;
    container.hidden = !links.trim();
  });
}
function storefront() {
  const view = document.querySelector("#view");
  view.innerHTML = `${!configured ? '<div class="demo-note">Preview collection · example products with AI-generated collection imagery. Checkout opens after the store is connected.</div>' : ""}<section class="hero"><div class="hero-copy"><p class="eyebrow">THE BEAUTY OF SOMETHING HANDMADE</p><h1>Little things.<br>Lasting <em>joy.</em></h1><p>Bring warmth to your home and meaning to your gifts. Discover pieces made with care, for moments that matter.</p><a class="primary" href="#collection">Explore the collection <span>↗</span></a><div class="hero-note"><span>✧</span> Made with care. Chosen with love.</div></div><div class="hero-photo">${img(sampleImage, "Illustrative handmade basket, ceramics, candle and wrapped gift")}<span class="photo-label">A little warmth, wherever you call home.</span><div class="round-seal">HANDMADE<br>with love<br>✧</div></div></section><div class="values"><span>✧ Thoughtfully handcrafted</span><span>♧ Small-batch treasures</span><span>♡ Gifts with a personal touch</span></div><section id="collection" class="collection"><div class="section-heading"><div><p class="eyebrow">FIND YOUR LITTLE JOY</p><h2>Made for your everyday.</h2></div><p>Pieces to love. Stories to keep.</p></div><div class="filters">${["All", ...new Set(state.products.map((p) => p.category))].map((c) => `<button data-filter="${e(c)}" class="${state.filter === c ? "selected" : ""}">${e(c)}</button>`).join("")}</div><div class="grid">${
    state.products
      .filter((p) => state.filter === "All" || p.category === state.filter)
      .map(
        (p) =>
          `<article class="product"><div class="product-photo" tabindex="0" role="button" aria-label="View ${e(p.name)}" data-open="${e(p.id)}">${p.sale_price != null ? '<span class="badge">A little treat · sale</span>' : ""}${img(p.images[0], p.name)}<button class="quick" data-open="${e(p.id)}">Take a closer look ↗</button>${p.images.length > 1 ? `<button class="card-prev" data-slide="${e(p.id)}:-1" aria-label="Previous product photo">‹</button><button class="card-next" data-slide="${e(p.id)}:1" aria-label="Next product photo">›</button>` : ""}</div><div class="product-meta"><span>${e(p.category)}</span><h3><button data-open="${e(p.id)}">${e(p.name)}</button></h3><p>${money(priceOf(p))} ${p.sale_price != null ? `<del>${money(p.price)}</del>` : ""}</p></div></article>`,
      )
      .join("") ||
    "<p>The collection is coming soon. Check back for handmade treasures.</p>"
  }</div></section><section class="story" id="story"><p class="eyebrow">FROM OUR HANDS TO YOUR HOME</p><h2>Crafted slowly.<br><em>Loved for a long time.</em></h2><p>Sehar Crafts is a home for handmade decorations and thoughtful gifts. We believe the smallest details can make a space—and a day—feel special.</p><div class="stat"><strong>${state.delivered}</strong><span>orders delivered${configured ? "" : " · store not launched yet"}</span></div></section><section class="testimonials"><p class="eyebrow">LITTLE NOTES OF LOVE</p><h2>From our customers</h2><div class="quotes">${state.testimonials.length ? state.testimonials.map((t) => `<blockquote>“${e(t.quote)}”<cite>${e(t.name)}</cite></blockquote>`).join("") : "<p>Our story is just beginning. Customer reviews will appear here after the first deliveries.</p>"}</div></section>`;
  view.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        storefront();
        document.querySelector("#collection").scrollIntoView();
      }),
  );
  view.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = () => showProduct(b.dataset.open);
    if (b.matches("[role=button]"))
      b.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          showProduct(b.dataset.open);
        }
      };
  });
  view.querySelectorAll("[data-slide]").forEach(
    (b) =>
      (b.onclick = (ev) => {
        ev.stopPropagation();
        const [id, step] = b.dataset.slide.split(":");
        const p = state.products.find((p) => p.id === id);
        const image = b.parentElement.querySelector("img");
        const index = Number(image.dataset.index || 0);
        const next = (index + Number(step) + p.images.length) % p.images.length;
        image.src = safeImage(p.images[next]);
        image.style.display = "";
        image.dataset.index = next;
      }),
  );
}
function modal(html) {
  const d = document.querySelector("#modal");
  if (d.open) d.close();
  d.className = "";
  d.removeAttribute("aria-labelledby");
  d.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`;
  d.querySelector(".close").onclick = () => d.close();
  d.onclick = (ev) => {
    if (ev.target === d) d.close();
  };
  d.showModal();
  return d;
}
function showProduct(id) {
  const p = state.products.find((p) => p.id === id);
  let index = 0;
  let timer;
  const d = modal(
    `<div class="product-dialog"><div class="gallery">${img(p.images[0], p.name)}<div class="gallery-controls"><button id="prev" aria-label="Previous image">←</button><span id="position">1 / ${p.images.length}</span><button id="play">Play</button><button id="next" aria-label="Next image">→</button></div></div><div class="detail"><p class="eyebrow">${e(p.category)}</p><h2>${e(p.name)}</h2><p class="price">${money(priceOf(p))} ${p.sale_price != null ? `<del>${money(p.price)}</del>` : ""}</p><p>${e(p.description)}</p><p class="offer">${e(p.offer)}</p><label>Quantity <input id="quantity" type="number" value="1" min="1" max="20"></label><button class="primary" id="add">Add to bag ↗</button><p class="muted">${e(state.settings.delivery_note)}</p></div></div>`,
  );
  const move = (step) => {
    index = (index + step + p.images.length) % p.images.length;
    d.querySelector(".gallery img").src = safeImage(p.images[index]);
    d.querySelector(".gallery img").style.display = "";
    d.querySelector("#position").textContent =
      `${index + 1} / ${p.images.length}`;
  };
  d.querySelector("#prev").onclick = () => move(-1);
  d.querySelector("#next").onclick = () => move(1);
  d.querySelector("#play").onclick = (ev) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      ev.target.textContent = "Play";
    } else {
      timer = setInterval(() => move(1), 3000);
      ev.target.textContent = "Pause";
    }
  };
  d.addEventListener("close", () => clearInterval(timer), { once: true });
  d.querySelector("#add").onclick = () => {
    const q = Number(d.querySelector("#quantity").value);
    if (!Number.isInteger(q) || q < 1 || q > 20)
      return toast("Choose 1–20 items.");
    const item = state.cart.find((i) => i.id === id);
    if (item && item.quantity + q > 20)
      return toast("Maximum 20 of each item per order.");
    if (item) item.quantity += q;
    else state.cart.push({ id, quantity: q });
    updateBagCount();
    d.close();
    toast("A little joy added to your bag.");
  };
}
function showCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const d = modal(`<div class="bag-heading"><p class="eyebrow">CHOSEN WITH LOVE</p><h2 id="bag-title">Your little joys</h2><p class="muted">${count} ${count === 1 ? "item" : "items"} in your bag</p></div><div class="bag-items">${state.cart.length ? state.cart.map((item) => {
    const p = state.products.find((product) => product.id === item.id);
    return `<article class="bag-item"><div class="bag-thumbnail">${img(p.images[0], p.name)}</div><div class="bag-item-copy"><h3>${e(p.name)}</h3><p class="muted">Quantity: ${item.quantity}</p><strong>${money(priceOf(p) * item.quantity)}</strong></div><button data-remove="${e(item.id)}" class="bag-remove" aria-label="Remove ${e(p.name)}">×<span>Remove</span></button></article>`;
  }).join("") : '<div class="bag-empty"><p>Your bag is waiting for something lovely.</p><button id="continue-shopping">Explore the collection ↗</button></div>'}</div>${state.cart.length ? `<div class="bag-checkout"><div><span>Subtotal</span><strong>${money(totalOf(state.cart, state.products))}</strong></div><p class="muted">Delivery charges are confirmed before payment.</p><button class="primary" id="proceed-checkout">Check out <span aria-hidden="true">↗</span></button><button class="bag-continue" id="continue-shopping">Continue shopping</button></div>` : ""}`);
  d.className = "bag-dialog";
  d.setAttribute("aria-labelledby", "bag-title");
  d.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      const index = state.cart.findIndex((item) => item.id === button.dataset.remove);
      state.cart = state.cart.filter((item) => item.id !== button.dataset.remove);
      updateBagCount();
      showCart();
      const buttons = d.querySelectorAll("[data-remove]");
      (buttons[Math.min(index, buttons.length - 1)] || d.querySelector("#continue-shopping")).focus();
    };
  });
  d.querySelector("#continue-shopping").onclick = () => d.close();
  const checkout = d.querySelector("#proceed-checkout");
  if (checkout) checkout.onclick = showCheckout;
}
function showCheckout() {
  const d = modal(
    `<h2>Your little joys</h2>${
      state.cart.length
        ? `<div class="cart-lines">${state.cart
            .map((item) => {
              const p = state.products.find((p) => p.id === item.id);
              return `<div><span>${e(p.name)} × ${item.quantity}</span><strong>${money(priceOf(p) * item.quantity)}</strong><button data-remove="${e(item.id)}" aria-label="Remove ${e(p.name)}">×</button></div>`;
            })
            .join(
              "",
            )}</div><h3>Subtotal ${money(totalOf(state.cart, state.products))}</h3><p class="muted">Orders are recorded in PKR. USD figures, when enabled, are estimates using the owner’s published conversion rate.</p><p>${e(state.settings.delivery_note)}</p><form id="checkout"><label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Phone<input name="phone" type="tel" required maxlength="30" autocomplete="tel"></label><label>Delivery address<textarea name="address" required maxlength="1000" autocomplete="street-address"></textarea></label><label>Payment option<select name="payment_method" required><option value="">Choose a payment option</option>${paymentMethods(
            state.settings,
          )
            .map(
              (key) =>
                `<option value="${key}">${e(paymentLabels[key])}</option>`,
            )
            .join(
              "",
            )}</select></label>${paymentMethods(state.settings).length ? "" : '<p class="muted">The owner has not enabled payment options yet.</p>'}<label>Note (optional)<textarea name="note" maxlength="1000"></textarea></label><label class="check"><input name="consent" type="checkbox" required> I agree to use my contact details to process this order.</label><p class="muted">Order requests are subject to owner confirmation. No payment is collected on this page.</p><button class="primary" ${!configured ? "disabled" : ""}>${configured ? "Place order request" : "Preview only · connect store to order"}</button><p id="checkout-error" role="alert"></p></form>`
        : "<p>Your bag is waiting for something lovely.</p>"
    }`,
  );
  d.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        state.cart = state.cart.filter((i) => i.id !== b.dataset.remove);
        updateBagCount();
        showCart();
      }),
  );
  const form = d.querySelector("#checkout");
  if (form)
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!db) return;
      const button = form.querySelector("button");
      button.disabled = true;
      const values = Object.fromEntries(new FormData(form));
      const { data, error } = await db.rpc("place_order", {
        customer: {
          name: values.name,
          email: values.email,
          phone: values.phone,
          address: values.address,
          note: values.note,
          payment_method: values.payment_method,
        },
        items: state.cart.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
        })),
      });
      if (error) {
        form.querySelector("#checkout-error").textContent =
          "Could not place the order. Please try again. " + error.message;
        button.disabled = false;
        return;
      }
      state.cart = [];
      updateBagCount();
      const d = modal('<div id="payment-result"></div>');
      await renderPayment(
        data,
        data.payment_token,
        d.querySelector("#payment-result"),
      );
    };
}
async function owner() {
  const view = document.querySelector("#view");
  if (!db) {
    view.innerHTML =
      '<section class="studio"><p class="eyebrow">OWNER STUDIO</p><h1>Your creative<br><em>headquarters.</em></h1><p>Connect Supabase to enable secure owner login, photo uploads, product editing, order management, and payment settings.</p><p>See README.md for the deployment checklist. Public visitors cannot use a demo admin account.</p></section>';
    return;
  }
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) {
    view.innerHTML =
      '<section class="studio"><p class="eyebrow">OWNER STUDIO</p><h2>Welcome back.</h2><form id="login"><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Sign in</button><p id="login-error" role="alert"></p></form><p><a class="auth-link" href="#/forgot-password">Forgot password?</a></p></section>';
    view.querySelector("#login").onsubmit = async (ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(ev.target));
      const { error } = await db.auth.signInWithPassword(v);
      if (error) view.querySelector("#login-error").textContent = error.message;
      else owner();
    };
    return;
  }
  const { data: allowed, error: authError } = await db.rpc("is_owner");
  if (authError || !allowed) {
    view.innerHTML =
      '<section class="studio"><h2>Owner access required</h2><button id="logout">Sign out</button></section>';
    view.querySelector("#logout").onclick = async () => {
      await db.auth.signOut();
      owner();
    };
    return;
  }
  state.owner = true;
  const { data: privateSettings, error: settingsError } = await db
    .from("owner_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (settingsError) throw settingsError;
  state.ownerSettings = privateSettings;
  const { data: orders, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    view.innerHTML = `<section class="studio"><p role="alert">${e(error.message)}</p></section>`;
    return;
  }
  state.orders = orders;
  const { data: allProducts } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  view.innerHTML = `<section class="studio wide"><div class="section-heading"><div><p class="eyebrow">OWNER STUDIO</p><h2>Good things start here.</h2></div><button id="logout">Sign out</button></div><div class="owner-tabs"><button data-tab="orders">Orders (${orders.filter((o) => o.status === "placed").length} new)</button><button data-tab="products">Products</button><button data-tab="settings">Payment & delivery</button><button data-tab="reviews">Testimonials</button><button data-tab="account">Account & login</button><button id="notifications">Enable browser alerts</button></div><p class="muted">Orders refresh every 30 seconds while this dashboard is open. Email alerts require the notification service described in README.</p><div id="panel"></div></section>`;
  view.querySelector("#logout").onclick = async () => {
    clearInterval(window.ownerPoll);
    await db.auth.signOut();
    state.owner = false;
    owner();
  };
  view.querySelector("#notifications").onclick = async () => {
    if (!("Notification" in window))
      return toast("Browser notifications are unavailable here.");
    const permission = await Notification.requestPermission();
    toast(
      permission === "granted"
        ? "Browser alerts enabled while the dashboard is open."
        : "Browser alerts were not enabled.",
    );
  };
  view
    .querySelectorAll("[data-tab]")
    .forEach(
      (b) => (b.onclick = () => renderPanel(b.dataset.tab, allProducts || [])),
    );
  renderPanel("orders", allProducts || []);
  clearInterval(window.ownerPoll);
  let latest = orders[0]?.id;
  window.ownerPoll = setInterval(async () => {
    if (!location.hash.startsWith("#/owner")) return;
    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return;
    if (data[0] && data[0].id !== latest) {
      toast("A new order has arrived. Open Orders to refresh.");
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("Sehar Crafts", {
          body: "A new order request has arrived.",
        });
    }
    latest = data[0]?.id;
    state.orders = data;
  }, 30000);
}
async function renderAccount(panel) {
  panel.innerHTML = `<h3>Account & login</h3><p>This changes the email for your existing owner account. Your products, orders and owner permissions stay with the same account.</p><p id="current-login-email">Loading current login…</p><p><a class="auth-link" href="#/forgot-password">Forgot your current password? Send a reset link</a></p><form id="change-login-email"><label>New login email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Current password<input name="password" type="password" required autocomplete="current-password"></label><p class="muted">Confirm the message sent to your new email. For new-address-only confirmation, turn off Secure email change in Supabase while keeping Confirm email enabled. Your password stays the same. Keep your current session open until you can sign in with the new address.</p><button class="primary" disabled>Request email change</button><p id="account-message" role="status"></p></form><p class="muted">The notification receiving email is separate. Update it in Payment & delivery after confirming the new login email.</p>`;
  panel.insertAdjacentHTML(
    "beforeend",
    `<section class="account-password"><h3>Change password</h3><form id="change-password"><label>Current password<input name="current" type="password" required autocomplete="current-password"></label><label>New password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>Confirm new password<input name="confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="muted">Use a strong, unique password for your store login. If you do not know the current password, use the reset link above.</p><button class="primary" disabled>Change password</button><p id="password-message" role="status"></p></form></section>`,
  );
  const form = panel.querySelector("#change-login-email");
  const message = form.querySelector("#account-message");
  const button = form.querySelector("button");
  try {
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user) throw error || new Error("Please sign in again.");
    if (!panel.contains(form)) return;
    panel.querySelector("#current-login-email").textContent =
      `Current login: ${user.email}${user.new_email ? " · Pending change: " + user.new_email : ""}`;
    button.disabled = false;
    const change = panel.querySelector("#change-password");
    const changeButton = change.querySelector("button");
    const changeMessage = change.querySelector("#password-message");
    changeButton.disabled = false;
    change.onsubmit = async (event) => {
      event.preventDefault();
      const password = change.elements.password.value;
      const issue = passwordError(password, change.elements.confirm.value);
      if (issue) {
        changeMessage.textContent = issue;
        return;
      }
      if (password === change.elements.current.value) {
        changeMessage.textContent = "Choose a different new password.";
        return;
      }
      changeButton.disabled = true;
      changeMessage.textContent = "Checking your current password…";
      try {
        const { data: reauth, error: reauthError } =
          await db.auth.signInWithPassword({
            email: user.email,
            password: change.elements.current.value,
          });
        change.elements.current.value = "";
        if (reauthError) throw reauthError;
        if (reauth.user?.id !== user.id)
          throw new Error("Account verification failed. Please sign in again.");
        const { error: updateError } = await db.auth.updateUser({ password });
        if (updateError) throw updateError;
        change.reset();
        changeMessage.textContent =
          "Password changed. Use your new password the next time you sign in.";
      } catch (err) {
        changeMessage.textContent = err.message;
      } finally {
        changeButton.disabled = false;
      }
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim();
      if (email.toLowerCase() === user.email.toLowerCase()) {
        message.textContent = "Enter a different email address.";
        return;
      }
      button.disabled = true;
      message.textContent = "Checking your current password…";
      try {
        const { data: reauth, error: passwordError } =
          await db.auth.signInWithPassword({
            email: user.email,
            password: form.elements.password.value,
          });
        form.elements.password.value = "";
        if (passwordError) throw passwordError;
        if (reauth.user?.id !== user.id)
          throw new Error("Account verification failed. Please sign in again.");
        const redirect = authRedirect(
          import.meta.env.BASE_URL,
          location.origin,
        );
        const { error: updateError } = await db.auth.updateUser(
          { email },
          { emailRedirectTo: redirect },
        );
        if (updateError) throw updateError;
        message.textContent =
          "Email change requested. Check your new inbox for confirmation. After confirming, test the new email with your existing password in a private browser window. If Secure email change is still enabled in Supabase, the current inbox must also confirm.";
        button.textContent = "Email change requested";
      } catch (err) {
        message.textContent = err.message;
        button.disabled = false;
      }
    };
  } catch (err) {
    message.textContent = err.message;
  }
}
function renderOrders(panel) {
  const orders = state.orders.map((order) => ({ ...order }));
  const statuses = ["placed", "confirmed", "dispatched", "delivered", "cancelled"];
  const payments = ["pending", "received", "refunded"];
  panel.innerHTML = `<div class="section-heading"><h3>Latest 100 orders</h3><button id="refresh">Refresh orders</button></div><div class="order-filters"><label>Search orders<input id="order-search" type="search" placeholder="Order number, customer, email, phone or product"></label><label>Order status<select id="order-filter"><option value="">All statuses</option>${statuses.map((status) => `<option>${status}</option>`).join("")}</select></label><label>Payment status<select id="payment-filter"><option value="">All payments</option>${payments.map((status) => `<option>${status}</option>`).join("")}</select></label></div><p class="muted">Hover to preview. Click a row to keep it open. Status changes are sent only when you save.</p><p id="order-results" class="muted" role="status"></p><div class="order-rows">${orders.map((o) => `<details class="order-row" data-order="${e(o.id)}"><summary><strong>${e(o.order_number)}</strong><span class="order-customer">${e(o.customer.name)}</span><span class="order-summary-status">${e(o.status)} · ${e(o.payment_status)}</span><strong>${money(o.total)}</strong><span aria-hidden="true" class="order-chevron">⌄</span></summary><div class="order-details"><p>${e(o.customer.email)} · ${e(o.customer.phone)}</p><p>${e(o.customer.address)}</p>${o.customer.note ? `<p>${e(o.customer.note)}</p>` : ""}<p>Preferred payment: ${e(paymentLabels[o.payment_method] || o.payment_method)}</p><div class="order-links"><a href="${e(trackingUrl(o.payment_token))}" target="_blank" rel="noopener">Order tracking & cancellation ↗</a><a href="${e(paymentPageUrl(o.payment_token, location.href))}" target="_blank" rel="noopener">Payment page & QR ↗</a></div>${o.cancellation_reason ? `<p>${e(o.cancellation_reason)}</p>` : ""}<ul>${o.items.map((item) => `<li>${e(item.name)} × ${item.quantity} · ${money(item.unit_price)}</li>`).join("")}</ul><strong>Product subtotal: ${money(o.total)}</strong><p class="muted">Delivery charges must be confirmed separately before requesting payment.</p><form class="order-update"><div class="form-row"><label>Order status<select name="status" aria-label="Order status">${statuses.map((status) => `<option ${o.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><label>Payment status<select name="payment_status" aria-label="Payment status">${payments.map((status) => `<option ${o.payment_status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></div><div class="order-save"><button class="primary" disabled>Save changes</button><button type="button" class="order-reset" disabled>Discard changes</button></div><p class="order-message muted" role="status"></p></form></div></details>`).join("")}</div><p id="no-orders" hidden>No orders match your search.</p>`;
  const rows = [...panel.querySelectorAll(".order-row")];
  const filter = () => {
    const query = panel.querySelector("#order-search").value.trim().toLowerCase();
    const status = panel.querySelector("#order-filter").value;
    const payment = panel.querySelector("#payment-filter").value;
    let shown = 0;
    rows.forEach((row, index) => {
      const o = orders[index];
      const text = [o.order_number, o.customer.name, o.customer.email, o.customer.phone, o.customer.address, ...o.items.map((item) => item.name)].join(" ").toLowerCase();
      row.hidden = !(text.includes(query) && (!status || o.status === status) && (!payment || o.payment_status === payment));
      if (!row.hidden) shown++;
    });
    panel.querySelector("#no-orders").hidden = shown > 0;
    panel.querySelector("#order-results").textContent = `${shown} of ${orders.length} loaded orders`;
  };
  for (const id of ["order-search", "order-filter", "payment-filter"])
    panel.querySelector(`#${id}`).oninput = filter;
  filter();
  panel.querySelector("#refresh").onclick = () => {
    if (rows.some((row) => row.dataset.dirty === "true") && !window.confirm("Discard unsaved order changes and refresh?")) return;
    owner().catch((error) => toast(error.message));
  };
  rows.forEach((row, index) => {
    const order = orders[index];
    const form = row.querySelector("form");
    const save = form.querySelector(".primary");
    const reset = form.querySelector(".order-reset");
    const message = form.querySelector(".order-message");
    const dirty = () => form.elements.status.value !== order.status || form.elements.payment_status.value !== order.payment_status;
    const markDirty = () => {
      row.dataset.dirty = String(dirty());
      save.disabled = reset.disabled = !dirty();
      message.textContent = dirty() ? "Unsaved changes — save to update this order and queue its alerts." : "";
    };
    row.querySelector("summary").onclick = (event) => {
      event.preventDefault();
      row.dataset.pinned = String(row.dataset.pinned !== "true");
      row.open = row.dataset.pinned === "true" || dirty();
    };
    row.onpointerenter = (event) => {
      if (event.pointerType === "mouse") row.open = true;
    };
    row.onpointerleave = () => {
      if (row.dataset.pinned !== "true" && !dirty() && !row.contains(document.activeElement)) row.open = false;
    };
    form.onchange = markDirty;
    reset.onclick = () => {
      form.elements.status.value = order.status;
      form.elements.payment_status.value = order.payment_status;
      markDirty();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!dirty() || save.disabled) return;
      const changes = {};
      for (const field of ["status", "payment_status"])
        if (form.elements[field].value !== order[field]) changes[field] = form.elements[field].value;
      const controls = [...form.querySelectorAll("button, select")];
      controls.forEach((control) => control.disabled = true);
      message.textContent = "Saving…";
      try {
        const { data, error } = await db.from("orders").update(changes).eq("id", order.id).eq("status", order.status).eq("payment_status", order.payment_status).select("id,status,payment_status").single();
        if (error) throw error;
        if (!data) throw new Error("This order changed elsewhere. Refresh orders before saving again.");
        Object.assign(order, data);
        const stored = state.orders.find((item) => item.id === order.id);
        if (stored) Object.assign(stored, data);
        row.querySelector(".order-summary-status").textContent = `${order.status} · ${order.payment_status}`;
        form.elements.status.value = order.status;
        form.elements.payment_status.value = order.payment_status;
        row.dataset.dirty = "false";
        message.textContent = "Saved. Order notifications have been queued.";
        const tab = document.querySelector('[data-tab="orders"]');
        tab.textContent = `Orders (${state.orders.filter((item) => item.status === "placed").length} new)`;
        filter();
      } catch (error) {
        message.textContent = error.code === "PGRST116" ? "This order changed elsewhere. Refresh orders before saving again." : "Could not save changes. " + error.message;
      } finally {
        controls.forEach((control) => control.disabled = false);
        save.disabled = reset.disabled = !dirty();
      }
    };
  });
}
function renderPanel(tab, products) {
  const panel = document.querySelector("#panel");
  if (tab === "account") {
    renderAccount(panel);
    return;
  }
  if (tab === "orders") {
    renderOrders(panel);
    return;
  }
  if (tab === "reviews") {
    panel.innerHTML = `<h3>Publish a customer testimonial</h3><p>Only publish genuine customer feedback with their permission.</p><form id="review-form"><label>Customer display name<input name="name" required maxlength="100"></label><label>Feedback<textarea name="quote" required maxlength="2000"></textarea></label><button class="primary">Publish testimonial</button></form>`;
    panel.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      const values = Object.fromEntries(new FormData(ev.target));
      const { error } = await db
        .from("testimonials")
        .insert({ ...values, published: true });
      if (error) toast(error.message);
      else {
        ev.target.reset();
        toast("Testimonial published.");
      }
    };
    return;
  }
  if (tab === "settings") {
    panel.innerHTML = `<h3>Store information & notifications</h3><form id="settings-form"><label>Owner notification email (private)<input name="notification_email" type="email" maxlength="254" value="${e(state.ownerSettings.notification_email)}" placeholder="Your order alert email" required></label><p class="muted">New-order and order/payment status alerts go here after email delivery is configured. This address is not shown publicly on the storefront.</p>${["instagram", "facebook", "tiktok"].map((name) => `<label>${name[0].toUpperCase() + name.slice(1)} link (public, optional)<input name="${name}_url" type="url" pattern="https://.*" maxlength="500" value="${e(state.settings[name + "_url"])}" placeholder="https://…"></label>`).join("")}<p>Order currency: PKR. USD is an optional display estimate.</p><label>PKR per 1 USD (optional; update regularly)<input name="usd_rate" type="number" min="0.01" step="0.01" value="${e(state.settings.usd_rate ?? "")}"></label><h3>Receiving accounts & payment options</h3>${Object.entries(
      paymentFields,
    )
      .map(
        ([key, label]) =>
          `<label>${e(label)}<input name="${key}" ${key === "payment_url" ? 'type="url" pattern="https://.*"' : 'type="text"'} maxlength="300" value="${e(state.settings[key])}"></label>`,
      )
      .join(
        "",
      )}<label class="check"><input name="cod_enabled" type="checkbox" ${state.settings.cod_enabled ? "checked" : ""}> Offer cash on delivery (confirm availability per address)</label><p class="muted">Complete account title and number to enable each wallet. Bank transfer needs bank name, account title and account number or IBAN. Use only a merchant-issued online payment link.</p><label>Payment instructions (public)<textarea name="payment_details" required maxlength="2000">${e(state.settings.payment_details)}</textarea></label><label>Delivery policy<textarea name="delivery_note" required maxlength="2000">${e(state.settings.delivery_note)}</textarea></label><p>Only enter payment receiving information you intend to show publicly. Never enter passwords, PINs, or API keys.</p><button class="primary">Save settings</button></form>`;
    panel.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      const values = Object.fromEntries(new FormData(ev.target));
      values.usd_rate = values.usd_rate ? Number(values.usd_rate) : null;
      values.cod_enabled = ev.target.elements.cod_enabled.checked;
      for (const prefix of ["jazzcash", "easypaisa"]) {
        if (
          Boolean(values[prefix + "_name"]) !==
          Boolean(values[prefix + "_number"])
        )
          return toast(
            "Enter both the wallet account title and mobile number.",
          );
      }
      if (
        (values.bank_name ||
          values.bank_account_title ||
          values.bank_account_number ||
          values.bank_iban) &&
        !(
          values.bank_name &&
          values.bank_account_title &&
          (values.bank_account_number || values.bank_iban)
        )
      )
        return toast(
          "Complete the bank name, account title and account number or IBAN.",
        );
      const notification_email = values.notification_email;
      delete values.notification_email;
      const { error: privateError } = await db
        .from("owner_settings")
        .update({ notification_email })
        .eq("id", 1);
      if (privateError) return toast(privateError.message);
      state.ownerSettings.notification_email = notification_email;
      const { error } = await db
        .from("store_settings")
        .update(values)
        .eq("id", 1);
      if (error) toast(error.message);
      else {
        Object.assign(state.settings, values);
        if (!values.usd_rate) state.displayCurrency = "PKR";
        document.querySelector("#display-currency option[value=USD]").disabled =
          !values.usd_rate;
        renderSocials();
        toast("Settings saved.");
      }
    };
    return;
  }
  panel.innerHTML = `<h3 id="edit-title">Add a product</h3><form id="product-form"><input type="hidden" name="id"><label>Name<input name="name" required maxlength="150"></label><label>Article code (optional)<input name="article" maxlength="80" placeholder="e.g. SC-CLOCK-001"></label><label>Category<input name="category" required maxlength="60"></label><label>Description<textarea name="description" required maxlength="3000"></textarea></label><div class="form-row"><label>Original price<input name="price" type="number" min="1" step="0.01" required></label><label>Discount price (optional)<input name="sale_price" type="number" min="1" step="0.01"></label></div><label>Offer<input name="offer" maxlength="500"></label><label>Upload photos (JPEG, PNG, WebP; up to 5 MB each)<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label class="check"><input name="active" type="checkbox" checked> Visible in store</label><button class="primary">Save product</button><button type="button" id="new-product">New product</button><div class="product-management" hidden><button type="button" id="toggle-product"></button><button type="button" id="delete-product" class="danger">Delete product</button><p class="muted">Deactivate hides the product until you reactivate it. Delete permanently removes the listing. Past orders keep their recorded product details.</p></div><p id="product-error" role="alert"></p></form><section class="owner-collection" aria-labelledby="collection-title"><h3 id="collection-title">Your collection</h3><p class="muted">Select a product to edit its details above.</p><label>Search products<input id="product-search" type="search" placeholder="Search by product name or article code"></label><p id="product-results" class="muted" role="status"></p><div class="product-list">${products.map((p) => `<button type="button" class="owner-product" data-edit="${e(p.id)}" aria-pressed="false"><span class="owner-product-image">${p.images?.[0] ? img(p.images[0], p.name) : ""}<span class="image-fallback" aria-hidden="true">✧</span></span><span class="owner-product-name">${e(p.name)}</span>${p.article ? `<span class="owner-product-article">Article: ${e(p.article)}</span>` : ""}<span class="owner-product-price">${money(priceOf(p))}</span>${p.active ? "" : '<span class="owner-product-status">Hidden</span>'}</button>`).join("") || '<p class="muted">Your products will appear here after you add them.</p>'}</div></section>`;
  const form = panel.querySelector("form");
  const productSearch = panel.querySelector("#product-search");
  const filterProducts = () => {
    const query = productSearch.value.trim().toLowerCase();
    let shown = 0;
    panel.querySelectorAll("[data-edit]").forEach((button) => {
      const product = products.find((item) => item.id === button.dataset.edit);
      button.hidden = !`${product.name} ${product.article || ""}`.toLowerCase().includes(query);
      if (!button.hidden) shown++;
    });
    panel.querySelector("#product-results").textContent = `${shown} of ${products.length} products${shown ? "" : " — no matching products"}`;
  };
  productSearch.oninput = filterProducts;
  filterProducts();
  panel.querySelector("#new-product").onclick = () => {
    form.reset();
    form.elements.id.value = "";
    panel.querySelector(".product-management").hidden = true;
    panel.querySelector("#edit-title").textContent = "Add a product";
    panel
      .querySelectorAll("[data-edit]")
      .forEach((button) => button.setAttribute("aria-pressed", "false"));
  };
  panel.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = products.find((p) => p.id === b.dataset.edit);
        form.reset();
        panel
          .querySelectorAll("[data-edit]")
          .forEach((button) =>
            button.setAttribute("aria-pressed", String(button === b)),
          );
        for (const key of [
          "id",
          "name",
          "category",
          "article",
          "description",
          "price",
          "sale_price",
          "offer",
        ])
          form.elements[key].value = p[key] ?? "";
        form.elements.active.checked = p.active;
        panel.querySelector(".product-management").hidden = false;
        panel.querySelector("#toggle-product").textContent = p.active ? "Deactivate product" : "Reactivate product";
        panel.querySelector("#product-error").textContent = "";
        panel.querySelector("#edit-title").textContent = "Edit product";
        panel.querySelector("#edit-title").scrollIntoView({ block: "start" });
        form.elements.name.focus({ preventScroll: true });
      }),
  );
  async function manageProduct(remove) {
    const product = products.find((item) => item.id === form.elements.id.value);
    if (!product) return;
    if (remove && !window.confirm(`Permanently delete "${product.name}"? This cannot be undone. Past orders will keep their recorded details. Choose Cancel to keep the product.`)) return;
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((button) => button.disabled = true);
    panel.querySelector("#product-error").textContent = "";
    try {
      const query = remove
        ? db.from("products").delete().eq("id", product.id)
        : db.from("products").update({ active: !product.active }).eq("id", product.id);
      const { error } = await query.select("id").single();
      if (error) throw error;
      if (remove) products.splice(products.indexOf(product), 1);
      else product.active = !product.active;
      if (remove || !product.active) {
        state.cart = state.cart.filter((item) => item.id !== product.id);
        updateBagCount();
      }
      await load();
      await owner();
      renderPanel("products", products);
      toast(remove ? "Product deleted. Past orders are preserved." : product.active ? "Product reactivated and visible in the store." : "Product deactivated and hidden from the store.");
    } catch (error) {
      panel.querySelector("#product-error").textContent = "Could not update the product. " + error.message;
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  }
  panel.querySelector("#toggle-product").onclick = () => manageProduct(false);
  panel.querySelector("#delete-product").onclick = () => manageProduct(true);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    try {
      const price = Number(values.price),
        sale = values.sale_price ? Number(values.sale_price) : null;
      if (sale !== null && sale >= price)
        throw new Error(
          "Discount price must be lower than the original price.",
        );
      const files = [...form.elements.photos.files];
      if (files.length > 8) throw new Error("Upload at most 8 images.");
      if (
        files.some(
          (f) =>
            !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
            f.size > 5 * 1024 * 1024,
        )
      )
        throw new Error("Use JPEG, PNG, or WebP images smaller than 5 MB.");
      let images = products.find((p) => p.id === values.id)?.images || [];
      if (files.length) {
        const uploaded = [];
        for (const file of files) {
          const path = `${crypto.randomUUID()}.${file.type.split("/")[1]}`;
          const { error } = await db.storage
            .from("product-images")
            .upload(path, file);
          if (error) throw error;
          uploaded.push(
            db.storage.from("product-images").getPublicUrl(path).data.publicUrl,
          );
        }
        images = uploaded;
      }
      if (!images.length) throw new Error("Add at least one product image.");
      const payload = {
        name: values.name,
        category: values.category,
        description: values.description,
        price,
        sale_price: sale,
        offer: values.offer,
        images,
        active: form.elements.active.checked,
      };
      const article = values.article.trim();
      const previous = products.find((product) => product.id === values.id);
      if (article || (previous && "article" in previous)) payload.article = article;
      const query = values.id
        ? db.from("products").update(payload).eq("id", values.id)
        : db.from("products").insert(payload);
      const { error } = await query;
      if (error) throw error;
      await load();
      await owner();
      toast("Product saved.");
    } catch (err) {
      panel.querySelector("#product-error").textContent = /article/i.test(err.message) && ["PGRST204", "42703"].includes(err.code)
        ? "Article codes need the one-time database update in supabase/article-upgrade.sql. Run it in Supabase SQL Editor, then save again."
        : err.message;
    } finally {
      button.disabled = false;
    }
  };
}
async function load() {
  if (!db) {
    state.storeLoaded = true;
    return;
  }
  const results = await Promise.all([
    db
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    db.from("store_settings").select("*").eq("id", 1).single(),
    db.from("testimonials").select("name,quote").eq("published", true),
    db.rpc("delivered_count"),
  ]);
  const failed = results.find((r) => r.error);
  if (failed)
    throw new Error("Store connection failed: " + failed.error.message);
  state.products = results[0].data;
  state.settings = results[1].data;
  state.testimonials = results[2].data;
  state.delivered = results[3].data;
  state.storeLoaded = true;
  renderSocials();
  document.querySelector("#display-currency option[value=USD]").disabled =
    !state.settings.usd_rate;
}

function paymentDetails(key) {
  const fields =
    key === "bank"
      ? ["bank_name", "bank_account_title", "bank_account_number", "bank_iban"]
      : key === "jazzcash"
        ? ["jazzcash_name", "jazzcash_number"]
        : key === "easypaisa"
          ? ["easypaisa_name", "easypaisa_number"]
          : [];
  return fields
    .filter((f) => state.settings[f])
    .map(
      (f) => `<dt>${e(paymentFields[f])}</dt><dd>${e(state.settings[f])}</dd>`,
    )
    .join("");
}
async function renderPayment(order, token, container) {
  const url = paymentPageUrl(token, location.href);
  const closed =
    ["cancelled", "delivered"].includes(order.status) ||
    order.payment_status === "received" ||
    order.payment_status === "refunded";
  container.innerHTML = `<p class="eyebrow">YOUR ORDER · PAYMENT OPTIONS</p><h2>${e(order.order_number)}</h2><p>Order: <strong>${e(order.status)}</strong> · Payment: <strong>${e(order.payment_status)}</strong></p><p>Product subtotal: <strong>PKR ${Number(order.total).toLocaleString("en-PK")}</strong></p><p><a class="primary" href="${e(trackingUrl(token))}">Track or cancel this order ↗</a></p><p>Preferred payment: ${e(paymentLabels[order.payment_method] || "Not recorded (older order)")}</p><p class="muted">Delivery and international charges are additional. Wait for owner confirmation of the final payable amount before transferring. Scanning does not record or confirm payment.</p><div class="payment-qr"><canvas id="order-qr" aria-label="QR code for this order payment page"></canvas><div><h3>Your order QR</h3><p>Scan to open this order’s payment instructions. Transfer using your bank or wallet app, or the owner’s online payment link.</p><a id="download-qr" download="${e(order.order_number)}-payment.png">Download QR</a> · <button id="copy-payment-link">Copy payment link</button></div></div><p class="muted">Keep this link private. Anyone with it can see the order reference, payment status and subtotal; customer contact details are excluded.</p>${
    closed
      ? "<p>No further payment is requested for this order. Contact the owner for any refund or adjustment.</p>"
      : `<div class="payment-options">${
          paymentMethods(state.settings)
            .map(
              (key) =>
                `<article><h3>${e(paymentLabels[key])}</h3><dl>${paymentDetails(key)}</dl>${key === "cod" ? "<p>Pay on delivery after the owner confirms this option is available at your address.</p>" : key === "online" ? `<a class="primary" href="${e(safeImage(state.settings.payment_url))}" target="_blank" rel="noopener noreferrer">Open secure provider page ↗</a><p class="muted">Verify the recipient and amount on the provider page. Include your order number where supported.</p>` : "<p>Use your order number as the transfer reference. Send the transaction reference to the owner after payment; the owner verifies it manually.</p>"}</article>`,
            )
            .join("") || "<p>The owner has not enabled payment methods yet.</p>"
        }</div>`
  }<p>${e(state.settings.payment_details)}</p>`;
  await QRCode.toCanvas(container.querySelector("#order-qr"), url, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  container.querySelector("#download-qr").href = container
    .querySelector("canvas")
    .toDataURL("image/png");
  container.querySelector("#copy-payment-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Payment link copied.");
    } catch {
      toast("Copy the link from your browser address bar: " + url);
    }
  };
}
async function paymentRoute() {
  const view = document.querySelector("#view");
  view.innerHTML =
    '<section class="studio wide" id="payment-view"><p>Loading payment instructions…</p></section>';
  const token = location.hash.slice("#/pay/".length);
  if (!db) {
    document.querySelector("#payment-view").textContent =
      "Connect the store to access order payment instructions.";
    return;
  }
  if (!/^[a-f0-9-]{36}$/i.test(token)) {
    document.querySelector("#payment-view").textContent =
      "Invalid payment link.";
    return;
  }
  const { data, error } = await db.rpc("order_payment", { token });
  if (error || !data) {
    document.querySelector("#payment-view").textContent =
      "Payment instructions could not be found. Check the link or contact the owner.";
    return;
  }
  await renderPayment(data, token, document.querySelector("#payment-view"));
}

function trackingUrl(token) {
  return paymentPageUrl(token, location.href).replace("#/pay/", "#/track/");
}
const updateLabels = {
  placed: "Order placed",
  confirmed: "Confirmed by owner",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_pending: "Payment pending",
  payment_received: "Payment received",
  payment_refunded: "Payment refunded",
};
async function trackingRoute() {
  const view = document.querySelector("#view");
  view.innerHTML =
    '<section class="studio wide" id="tracking-view"><p class="eyebrow">YOUR LITTLE JOYS, ON THEIR WAY</p><h2>Track your order</h2><form id="tracking-lookup"><label>Private tracking link or code<input name="code" required autocomplete="off" placeholder="Paste the link or code from your order confirmation"></label><button class="primary">View order</button></form><p class="muted">Use your private confirmation, tracking or payment link. An order number alone does not grant access. The owner can resend your link if needed.</p><div id="tracking-result" aria-live="polite"></div></section>';
  const lookup = document.querySelector("#tracking-lookup");
  lookup.onsubmit = (event) => {
    event.preventDefault();
    const value = lookup.elements.code.value.trim();
    let token = value;
    try {
      const url = new URL(value);
      token = url.hash.split("/").pop();
    } catch {}
    if (!/^[a-f0-9-]{36}$/i.test(token)) {
      toast("Paste a valid private order link or tracking code.");
      return;
    }
    location.hash = "/track/" + token;
  };
  const token = location.hash.slice("#/track/".length);
  if (location.hash === "#/track") return;
  const result = document.querySelector("#tracking-result");
  if (!db) {
    result.textContent = "Connect the store to track orders.";
    return;
  }
  if (!/^[a-f0-9-]{36}$/i.test(token)) {
    result.textContent = "Invalid tracking link.";
    return;
  }
  const { data: order, error } = await db.rpc("track_order", { token });
  if (error || !order) {
    result.textContent =
      "Tracking could not be loaded. Check your link or contact the owner.";
    return;
  }
  result.innerHTML = `<section class="tracking-summary"><h3>${e(order.order_number)}</h3><p>Order: <strong>${e(order.status)}</strong> · Payment: <strong>${e(order.payment_status)}</strong></p><p>Product subtotal: PKR ${Number(order.total).toLocaleString("en-PK")}</p><button id="refresh-tracking">Refresh status</button> <a href="${e(paymentPageUrl(token, location.href))}">Payment options & QR ↗</a><h3>Progress updates</h3><ol class="order-timeline">${(order.history || []).map((event) => `<li><strong>${e(updateLabels[event.kind] || event.kind)}</strong><time datetime="${e(event.created_at)}">${e(new Date(event.created_at).toLocaleString())}</time></li>`).join("") || "<li>Order recorded. Further updates will appear here.</li>"}</ol><p class="muted">Status updates are recorded by the owner. Courier location tracking is not connected. Keep this private link secure.</p>${order.status === "cancelled" ? `<p>Order cancelled. ${order.payment_status === "received" ? "Payment was received; contact the owner to arrange a refund. Refunds are processed separately." : ""}</p>` : ["placed", "confirmed"].includes(order.status) ? `<h3>Cancel this order</h3><p>You can cancel before dispatch.${order.payment_status === "received" ? " Your payment has been received. The owner must arrange your refund separately." : ""}</p><form id="cancel-order"><label>Email used for this order<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Reason (optional)<textarea name="reason" maxlength="500"></textarea></label><label class="check"><input type="checkbox" required> I confirm that I want to cancel this order.</label><button class="danger">Cancel order</button><p id="cancel-error" role="alert"></p></form>` : "<p>Online cancellation closes after dispatch. Contact the owner about returns or delivery issues.</p>"}</section>`;
  result.querySelector("#refresh-tracking").onclick = trackingRoute;
  const form = result.querySelector("#cancel-order");
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const { error } = await db.rpc("cancel_order", {
          token,
          customer_email: form.elements.email.value,
          reason: form.elements.reason.value,
        });
        if (error) throw error;
        await trackingRoute();
        toast("Order cancelled. Any refund must be arranged with the owner.");
      } catch (err) {
        form.querySelector("#cancel-error").textContent = err.message;
        button.disabled = false;
      }
    };
}

async function forgotPassword() {
  const view = document.querySelector("#view");
  view.innerHTML = `<section class="studio"><p class="eyebrow">OWNER ACCOUNT RECOVERY</p><h2>Forgot your password?</h2><p>Enter your current store login email. We’ll request a secure link to set a new password.</p><form id="forgot-password"><label>Login email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><button class="primary" ${db ? "" : "disabled"}>Send reset link</button><p id="recovery-message" role="status"></p></form><p class="muted">Use the address currently shown in Account & login. A new notification email does not automatically change the login email.</p><a class="auth-link" href="#/owner">Back to owner studio</a></section>`;
  const form = view.querySelector("#forgot-password");
  if (!db) {
    form.querySelector("#recovery-message").textContent =
      "Connect Supabase to enable account recovery.";
    return;
  }
  const {
    data: { session },
  } = await db.auth.getSession();
  if (session?.user?.email) form.elements.email.value = session.user.email;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const message = form.querySelector("#recovery-message");
    button.disabled = true;
    message.textContent = "Requesting a reset link…";
    try {
      const { error } = await db.auth.resetPasswordForEmail(
        form.elements.email.value.trim(),
        {
          redirectTo: authRedirect(
            import.meta.env.BASE_URL,
            location.origin,
            true,
          ),
        },
      );
      if (error) throw error;
      message.textContent =
        "If this email belongs to an account, a reset link has been requested. Check that inbox and spam folder. Keep this session open if you are already signed in.";
      button.textContent = "Reset link requested";
    } catch (err) {
      message.textContent = err.message;
      button.disabled = false;
    }
  };
}
async function resetPassword() {
  const view = document.querySelector("#view");
  view.innerHTML =
    '<section class="studio" id="reset-view"><h2>Set a new password</h2><p>Checking your recovery link…</p></section>';
  const target = view.querySelector("#reset-view");
  if (db) await recoveryRecording;
  const currentSession = db ? (await db.auth.getSession()).data.session : null;
  if (!db || !(await recoveryStore.matches(currentSession))) {
    state.passwordRecovery = false;
    target.innerHTML =
      '<h2>Request a recovery link</h2><p>This recovery link is missing, expired, or already used. A saved login session alone cannot authorize a password reset.</p><a class="auth-link" href="#/forgot-password">Request a new reset link</a>';
    return;
  }
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  const { data: allowed, error: ownerError } = await db.rpc("is_owner");
  if (
    error ||
    !user ||
    user.id !== currentSession.user.id ||
    ownerError ||
    !allowed
  ) {
    recoveryStore.clear();
    state.passwordRecovery = false;
    target.innerHTML =
      '<h2>Recovery could not be verified</h2><p>Use a fresh recovery link for the owner account.</p><a class="auth-link" href="#/forgot-password">Request a new reset link</a>';
    return;
  }
  state.passwordRecovery = true;
  target.innerHTML = `<h2>Set a new password</h2><p>Your recovery link is verified. Choose a new password for your store owner login.</p><form id="reset-password"><label>New password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>Confirm new password<input name="confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><button class="primary">Save new password</button><p id="reset-message" role="status"></p></form>`;
  // Auth has consumed the tokens; remove credentials and the recovery marker from the address bar.
  history.replaceState(
    null,
    "",
    authRedirect(import.meta.env.BASE_URL, location.origin) +
      "#/reset-password",
  );
  const form = target.querySelector("form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const message = form.querySelector("#reset-message");
    const password = form.elements.password.value;
    const issue = passwordError(password, form.elements.confirm.value);
    if (issue) {
      message.textContent = issue;
      return;
    }
    button.disabled = true;
    try {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      form.reset();
      state.passwordRecovery = false;
      recoveryStore.clear();
      await db.auth.signOut({ scope: "local" });
      history.replaceState(
        null,
        "",
        authRedirect(import.meta.env.BASE_URL, location.origin) + "#/owner",
      );
      await route();
      toast("Password updated. Sign in with your new password.");
    } catch (err) {
      message.textContent = err.message;
      button.disabled = false;
    }
  };
}

function confirmationNotice(failed) {
  document.querySelector("#view").innerHTML =
    `<section class="studio"><h2>${failed ? "Confirmation link unavailable" : "Check your email confirmations"}</h2><p>${failed ? "This email confirmation link is invalid, expired, or already used. Check your current login email in Account & login before requesting a fresh change." : "A confirmation step was accepted. Check your current login email in Account & login. If the change is still pending, use the latest confirmation email and follow your Supabase email settings."}</p><p class="muted">Keep your existing owner session until the new login is confirmed. The Supabase Site URL and allowed redirects must point to this store.</p><a class="auth-link" href="#/owner">Return to owner studio</a></section>`;
  history.replaceState(
    null,
    "",
    authRedirect(import.meta.env.BASE_URL, location.origin) + "#/auth-status",
  );
}

let routeGeneration = 0;
async function route() {
  const generation = ++routeGeneration;
  const dialog = document.querySelector("#modal");
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
  clearInterval(window.ownerPoll);
  if (location.hash === "#/forgot-password") {
    await forgotPassword();
    return;
  }
  if (
    state.passwordRecovery ||
    location.hash === "#/reset-password" ||
    (recoveryReturn && !state.recoveryReturnHandled)
  ) {
    state.recoveryReturnHandled = true;
    await resetPassword();
    return;
  }
  const callback = new URLSearchParams(location.hash.slice(1));
  if (
    callback.has("error") ||
    callback.has("error_code") ||
    callback.has("message")
  ) {
    confirmationNotice(callback.has("error") || callback.has("error_code"));
    return;
  }
  if (!state.storeLoaded) await load();
  if (generation !== routeGeneration) return;
  if (location.hash.startsWith("#/owner")) await owner();
  else if (location.hash.startsWith("#/track")) {
    await trackingRoute();
  } else if (location.hash.startsWith("#/pay/")) {
    await paymentRoute();
  } else {
    storefront();
    if (location.hash === "#story" || location.hash === "#collection")
      document.querySelector(location.hash)?.scrollIntoView();
  }
}
shell();
try {
  if (db) await db.auth.getSession();
  await route();
} catch (err) {
  document.querySelector("#view").innerHTML =
    `<section class="studio"><h2>We’ll be back shortly.</h2><p role="alert">${e(err.message)}</p><p>Please try again later.</p></section>`;
}
window.addEventListener("hashchange", () => {
  route().catch((err) => toast(err.message));
});
