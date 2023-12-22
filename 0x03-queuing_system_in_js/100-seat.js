// 100-seat.js

const express = require('express');
const redis = require('redis');
const { promisify } = require('util');
const kue = require('kue');

const app = express();
const client = redis.createClient();
const reserveSeatAsync = promisify(client.set).bind(client);
const getCurrentAvailableSeatsAsync = promisify(client.get).bind(client);

const queue = kue.createQueue();
const PORT = 1245;

let availableSeats = 50;
let reservationEnabled = true;

// Route to get the current number of available seats
app.get('/available_seats', async (req, res) => {
  res.json({ numberOfAvailableSeats: availableSeats });
});

// Route to reserve a seat
app.get('/reserve_seat', async (req, res) => {
  if (!reservationEnabled) {
    res.json({ status: 'Reservation are blocked' });
    return;
  }

  // Create and queue a job
  const job = queue.create('reserve_seat').save((err) => {
    if (err) {
      res.json({ status: 'Reservation failed' });
    } else {
      res.json({ status: 'Reservation in process' });
    }
  });

  // Job completion handler
  job.on('complete', () => {
    console.log(`Seat reservation job ${job.id} completed`);
  });

  // Job failure handler
  job.on('failed', (errorMessage) => {
    console.log(`Seat reservation job ${job.id} failed: ${errorMessage}`);
  });
});

// Route to process the queue
app.get('/process', async (req, res) => {
  res.json({ status: 'Queue processing' });

  // Process the queue reserve_seat (async)
  queue.process('reserve_seat', async (job, done) => {
    const currentSeats = await getCurrentAvailableSeatsAsync('available_seats');
    
    if (currentSeats > 0) {
      // Decrease the number of available seats
      await reserveSeatAsync('available_seats', currentSeats - 1);
      availableSeats = currentSeats - 1;

      if (availableSeats === 0) {
        reservationEnabled = false;
      }

      done();
    } else {
      // Fail the job if not enough seats are available
      done(new Error('Not enough seats available'));
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

