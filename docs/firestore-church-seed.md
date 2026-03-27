# Firestore Church Seed

Use [churches.seed.json](C:/AI_Projects/GIT/Church_APP/firebase/churches.seed.json) as the starting dataset for the `churches` collection.

## Recommended manual import for prototype

1. Open Firebase Console.
2. Open `Firestore Database`.
3. Create the collection `churches` if it does not already exist.
4. Create one document per church using the `id` value from the seed file.
5. Copy the matching `data` object fields into each document.

## Important fields

- `displayCity`
- `city`
- `address`
- `serviceTimes`
- `googleMapsLabel`
- `contactEmail`
- `sharedDrivePath`
- `teams`
- `isPublic`

## Notes

- Keep `isPublic = true` so guests can see church locations and service times.
- Add each church Instagram URL when you receive it from the local church teams.
- `admins` and `members` are prototype counts and can be updated later.
