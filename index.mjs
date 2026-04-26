import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import mysql from 'mysql2/promise';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.isAuthenticated;
  next();
});

const port = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

const fallbackAuthors = [
  { authorId: 1, firstName: 'Maya', lastName: 'Angelou' },
  { authorId: 2, firstName: 'Mark', lastName: 'Twain' }
];

const fallbackCategories = [
  { categoryId: 1, categoryName: 'Inspirational' },
  { categoryId: 2, categoryName: 'Humor' }
];

function requireAuth(req, res, next) {
  if (!req.session || !req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  next();
}

async function getConnection() {
  return mysql.createConnection(dbConfig);
}

async function runQuery(sql, params = []) {
  const conn = await getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

async function getAuthorsFromDb() {
  try {
    return await runQuery(`
      SELECT authorId, firstName, lastName, dob, dod, sex, profession, country, biography, portrait
      FROM authors
      ORDER BY lastName, firstName
    `);
  } catch (err) {
    console.log('Could not load authors from DB, using fallback authors.');
    return fallbackAuthors;
  }
}

async function getCategoriesFromDb() {
  try {
    return await runQuery(`
      SELECT categoryId, categoryName
      FROM categories
      ORDER BY categoryName
    `);
  } catch (err) {
    console.log('Could not load categories from DB, using fallback categories.');
    return fallbackCategories;
  }
}

async function ensureDeletedAuthorsTable() {
  try {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS authors_deleted (
        authorId INT,
        firstName VARCHAR(255),
        lastName VARCHAR(255),
        dob DATE,
        dod DATE NULL,
        sex VARCHAR(50),
        profession VARCHAR(255),
        country VARCHAR(255),
        biography TEXT,
        portrait TEXT,
        deletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.log('Could not create authors_deleted backup table.', err.message);
  }
}

app.get('/', async (req, res) => {
  try {
    const quotes = await runQuery(`
      SELECT 
        q.quoteId,
        q.quote,
        c.categoryName,
        a.firstName,
        a.lastName
      FROM quotes q
      LEFT JOIN authors a ON q.authorId = a.authorId
      LEFT JOIN categories c ON q.categoryId = c.categoryId
      ORDER BY q.quoteId DESC
    `).catch(() => []);

    res.render('home', { quotes });
  } catch (err) {
    res.status(500).send('Error loading home page.');
  }
});

app.get('/authors', requireAuth, async (req, res) => {
  try {
    const authors = await getAuthorsFromDb();
    res.render('authors', { authors });
  } catch (err) {
    res.status(500).send('Error loading authors page.');
  }
});

app.get('/authors/new', requireAuth, (req, res) => {
  res.render('addAuthor', {
    successMessage: null,
    errorMessage: null,
    formData: {}
  });
});

app.post('/authors/new', requireAuth, async (req, res) => {
  const {
    firstName,
    lastName,
    dob,
    dod,
    sex,
    profession,
    country,
    biography,
    portrait
  } = req.body;

  const formData = {
    firstName,
    lastName,
    dob,
    dod,
    sex,
    profession,
    country,
    biography,
    portrait
  };

  if (!firstName || !lastName || !dob || !sex || !profession || !country || !biography || !portrait) {
    return res.render('addAuthor', {
      successMessage: null,
      errorMessage: 'Please complete all required fields.',
      formData
    });
  }

  try {
    await runQuery(
      `
      INSERT INTO authors
      (firstName, lastName, dob, dod, sex, profession, country, biography, portrait)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [firstName, lastName, dob, dod || null, sex, profession, country, biography, portrait]
    );

    res.render('addAuthor', {
      successMessage: 'Author added successfully.',
      errorMessage: null,
      formData: {}
    });
  } catch (err) {
    console.log(err);
    res.render('addAuthor', {
      successMessage: null,
      errorMessage: 'Could not add author.',
      formData
    });
  }
});

app.get('/authors/update/:id', requireAuth, async (req, res) => {
  try {
    const rows = await runQuery(
      `SELECT * FROM authors WHERE authorId = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).send('Author not found.');
    }

    res.render('updateAuthor', {
      author: rows[0],
      successMessage: null,
      errorMessage: null
    });
  } catch (err) {
    res.status(500).send('Error loading author update form.');
  }
});

app.post('/authors/update/:id', requireAuth, async (req, res) => {
  const {
    firstName,
    lastName,
    dob,
    dod,
    sex,
    profession,
    country,
    biography,
    portrait
  } = req.body;

  const author = {
    authorId: req.params.id,
    firstName,
    lastName,
    dob,
    dod,
    sex,
    profession,
    country,
    biography,
    portrait
  };

  if (!firstName || !lastName || !dob || !sex || !profession || !country || !biography || !portrait) {
    return res.render('updateAuthor', {
      author,
      successMessage: null,
      errorMessage: 'Please complete all required fields.'
    });
  }

  try {
    await runQuery(
      `
      UPDATE authors
      SET firstName = ?, lastName = ?, dob = ?, dod = ?, sex = ?, profession = ?, country = ?, biography = ?, portrait = ?
      WHERE authorId = ?
      `,
      [firstName, lastName, dob, dod || null, sex, profession, country, biography, portrait, req.params.id]
    );

    const updatedRows = await runQuery(`SELECT * FROM authors WHERE authorId = ?`, [req.params.id]);

    res.render('updateAuthor', {
      author: updatedRows[0],
      successMessage: 'Author updated successfully.',
      errorMessage: null
    });
  } catch (err) {
    console.log(err);
    res.render('updateAuthor', {
      author,
      successMessage: null,
      errorMessage: 'Could not update author.'
    });
  }
});

app.post('/authors/delete/:id', requireAuth, async (req, res) => {
  try {
    await ensureDeletedAuthorsTable();

    const rows = await runQuery(`SELECT * FROM authors WHERE authorId = ?`, [req.params.id]);

    if (rows.length) {
      const a = rows[0];
      await runQuery(
        `
        INSERT INTO authors_deleted
        (authorId, firstName, lastName, dob, dod, sex, profession, country, biography, portrait)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [a.authorId, a.firstName, a.lastName, a.dob, a.dod, a.sex, a.profession, a.country, a.biography, a.portrait]
      );
    }

    await runQuery(`DELETE FROM authors WHERE authorId = ?`, [req.params.id]);
    res.redirect('/authors');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not delete author.');
  }
});

app.get('/quotes/new', requireAuth, async (req, res) => {
  const authors = await getAuthorsFromDb();
  const categories = await getCategoriesFromDb();

  res.render('newQuote', {
    authors,
    categories,
    errorMessage: null,
    successMessage: null,
    formData: {}
  });
});

app.post('/quotes/new', requireAuth, async (req, res) => {
  const { quote, authorId, categoryId } = req.body;
  const authors = await getAuthorsFromDb();
  const categories = await getCategoriesFromDb();
  const formData = { quote, authorId, categoryId };

  if (!quote || quote.trim().length < 5) {
    return res.render('newQuote', {
      authors,
      categories,
      errorMessage: 'Quote must be at least 5 characters long.',
      successMessage: null,
      formData
    });
  }

  if (!authorId || !categoryId) {
    return res.render('newQuote', {
      authors,
      categories,
      errorMessage: 'Please choose an author and a category.',
      successMessage: null,
      formData
    });
  }

  try {
    await runQuery(
      `INSERT INTO quotes (quote, authorId, categoryId) VALUES (?, ?, ?)`,
      [quote.trim(), authorId, categoryId]
    );

    res.render('newQuote', {
      authors,
      categories,
      errorMessage: null,
      successMessage: 'Quote added successfully.',
      formData: {}
    });
  } catch (err) {
    console.log(err);
    res.render('newQuote', {
      authors,
      categories,
      errorMessage: 'Could not add quote.',
      successMessage: null,
      formData
    });
  }
});

app.get('/quotes', requireAuth, async (req, res) => {
  try {
    const quotes = await runQuery(`
      SELECT
        q.quoteId,
        q.quote,
        q.authorId,
        q.categoryId,
        a.firstName,
        a.lastName,
        c.categoryName
      FROM quotes q
      LEFT JOIN authors a ON q.authorId = a.authorId
      LEFT JOIN categories c ON q.categoryId = c.categoryId
      ORDER BY q.quoteId DESC
    `);

    res.render('quotes', { quotes });
  } catch (err) {
    res.status(500).send('Error loading quotes page.');
  }
});

app.get('/quotes/update/:id', requireAuth, async (req, res) => {
  try {
    const [quote] = await Promise.all([
      runQuery(
        `
        SELECT quoteId, quote, authorId, categoryId
        FROM quotes
        WHERE quoteId = ?
        `,
        [req.params.id]
      ),
      getAuthorsFromDb(),
      getCategoriesFromDb()
    ]);

    const authors = await getAuthorsFromDb();
    const categories = await getCategoriesFromDb();

    if (!quote.length) {
      return res.status(404).send('Quote not found.');
    }

    res.render('updateQuote', {
      quoteItem: quote[0],
      authors,
      categories,
      successMessage: null,
      errorMessage: null
    });
  } catch (err) {
    console.log(err);
    res.status(500).send('Error loading quote update form.');
  }
});

app.post('/quotes/update/:id', requireAuth, async (req, res) => {
  const { quote, authorId, categoryId } = req.body;
  const authors = await getAuthorsFromDb();
  const categories = await getCategoriesFromDb();

  const quoteItem = {
    quoteId: req.params.id,
    quote,
    authorId,
    categoryId
  };

  if (!quote || quote.trim().length < 5 || !authorId || !categoryId) {
    return res.render('updateQuote', {
      quoteItem,
      authors,
      categories,
      successMessage: null,
      errorMessage: 'Please complete all fields correctly.'
    });
  }

  try {
    await runQuery(
      `
      UPDATE quotes
      SET quote = ?, authorId = ?, categoryId = ?
      WHERE quoteId = ?
      `,
      [quote.trim(), authorId, categoryId, req.params.id]
    );

    const rows = await runQuery(
      `SELECT quoteId, quote, authorId, categoryId FROM quotes WHERE quoteId = ?`,
      [req.params.id]
    );

    res.render('updateQuote', {
      quoteItem: rows[0],
      authors,
      categories,
      successMessage: 'Quote updated successfully.',
      errorMessage: null
    });
  } catch (err) {
    console.log(err);
    res.render('updateQuote', {
      quoteItem,
      authors,
      categories,
      successMessage: null,
      errorMessage: 'Could not update quote.'
    });
  }
});

app.post('/quotes/delete/:id', requireAuth, async (req, res) => {
  try {
    await runQuery('DELETE FROM quotes WHERE quoteId = ?', [req.params.id]);
    res.redirect('/quotes');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not delete quote.');
  }
});

app.get('/login', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/authors');
  }

  res.render('login', {
    errorMessage: null
  });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const rows = await runQuery(
      'SELECT * FROM admin_users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).render('login', { errorMessage: 'Invalid username or password.' });
    }

    req.session.isAuthenticated = true;
    req.session.username = rows[0].username;
    res.redirect('/authors');
  } catch (err) {
    console.log(err);
    res.status(500).render('login', { errorMessage: 'Login error.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out.');
    }
    res.redirect('/login');
  });
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});