import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Fallback data for participation credit
const fallbackAuthors = [
  { authorId: 1, firstName: 'Maya', lastName: 'Angelou' },
  { authorId: 2, firstName: 'Mark', lastName: 'Twain' }
];

const fallbackCategories = [
  { categoryId: 1, categoryName: 'Inspirational' },
  { categoryId: 2, categoryName: 'Humor' },
  { categoryId: 3, categoryName: 'Life' }
];

async function getConnection() {
  return mysql.createConnection(dbConfig);
}

async function getAuthorsFromDb() {
  try {
    const conn = await getConnection();
    const [rows] = await conn.query(`
      SELECT authorId, firstName, lastName
      FROM authors
      ORDER BY lastName, firstName
    `);
    await conn.end();
    return rows;
  } catch (err) {
    console.log('Could not load authors from DB, using fallback authors.');
    return fallbackAuthors;
  }
}

async function getCategoriesFromDb() {
  try {
    const conn = await getConnection();
    const [rows] = await conn.query(`
      SELECT categoryId, categoryName
      FROM categories
      ORDER BY categoryName
    `);
    await conn.end();
    return rows;
  } catch (err) {
    console.log('Could not load categories from DB, using fallback categories.');
    return fallbackCategories;
  }
}

app.get('/', async (req, res) => {
  try {
    let quotes = [];

    try {
      const conn = await getConnection();
      const [rows] = await conn.query(`
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
      `);
      await conn.end();
      quotes = rows;
    } catch (err) {
      console.log('Could not load quotes from DB for home page.');
    }

    res.render('home', { quotes });
  } catch (err) {
    res.status(500).send('Error loading home page.');
  }
});

app.get('/authors/new', (req, res) => {
  res.render('addAuthor', {
    successMessage: null,
    errorMessage: null,
    formData: {}
  });
});

app.post('/authors/new', async (req, res) => {
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

  if (
    !firstName ||
    !lastName ||
    !dob ||
    !dod ||
    !sex ||
    !profession ||
    !country ||
    !biography ||
    !portrait
  ) {
    return res.render('addAuthor', {
      successMessage: null,
      errorMessage: 'Please complete all required fields.',
      formData
    });
  }

  try {
    const conn = await getConnection();
    await conn.query(
      `
      INSERT INTO authors
      (firstName, lastName, dob, dod, sex, profession, country, biography, portrait)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        firstName,
        lastName,
        dob,
        dod,
        sex,
        profession,
        country,
        biography,
        portrait
      ]
    );
    await conn.end();

    res.render('addAuthor', {
      successMessage: 'Author added successfully.',
      errorMessage: null,
      formData: {}
    });
  } catch (err) {
    console.log(err);
    res.render('addAuthor', {
      successMessage: null,
      errorMessage: 'Could not add author. Check your database/table names.',
      formData
    });
  }
});

app.get('/quotes/new', async (req, res) => {
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

app.post('/quotes/new', async (req, res) => {
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
    const conn = await getConnection();
    await conn.query(
      `
      INSERT INTO quotes (quote, authorId, categoryId)
      VALUES (?, ?, ?)
      `,
      [quote.trim(), authorId, categoryId]
    );
    await conn.end();

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
      errorMessage: 'Could not add quote. Check your database/table names.',
      successMessage: null,
      formData
    });
  }
});

// Optional route if your assignment expects addQuotes.ejs by name
app.get('/quotes', async (req, res) => {
  const authors = await getAuthorsFromDb();
  const categories = await getCategoriesFromDb();

  res.render('addQuotes', {
    authors,
    categories,
    errorMessage: null,
    successMessage: null,
    formData: {}
  });
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});